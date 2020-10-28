const axios = require('axios')
const { WebClient } = require('@slack/web-api')
const { lambda, getFuncName } = require('./util')
const { _blocks, button, removeButton, signMessage } = require('./bday-blocks')


const GENERAL_CHANNEL_ID = 'C1FDR4QJF'
const { SLACK_OAUTH, DEPLOYED } = process.env
const web = new WebClient(SLACK_OAUTH)

const invalidInputNotice = (response_url, command) => (
  axios.post(response_url, {
    response_type: 'ephemeral',
    blocks: [
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Failed to proccess command */bday ${command}*. _Hint: be sure to link to a valid URL/valid user!_`,
        },
      },
    ],
  })
)
const confirmChannel = (response_url, cmd, channel) => (
  axios.post(response_url, {
    response_type: 'ephemeral',
    blocks: [
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Please run the */bday ${cmd}* command in channel: #${channel}.`,
        },
      },
    ],
  })
)

const worker = async ({
  command,
  channel_id,
  response_url,
  trigger_id,
  type,
  view_id,
  hash,
  data,
  blocks,
  action,
  ref,
  sender,
}) => {
  // send card for members to sign
  if (command.includes('sign')) {
    // first iteration returns modal
    if (!type) {
      // make sure to execute command from #general
      if (channel_id !== GENERAL_CHANNEL_ID) {
        const { channel: { name } } = await web.conversations.info({ channel: GENERAL_CHANNEL_ID })
        return confirmChannel(response_url, 'sign', name)
      }
      const state = {
        response_url,
        channel_id,
        ref: 1,
        command: 'sign',
      }
      return web.views.open({
        trigger_id,
        view: {
          'private_metadata': JSON.stringify(state),
          'type': 'modal',
          'title': {
            'type': 'plain_text',
            'text': 'Bday details'
          },
          'blocks': [..._blocks(state.ref), button],
          'close': {
            'type': 'plain_text',
            'text': 'Nevermind'
          },
          'submit': {
            'type': 'plain_text',
            'text': 'Send'
          },
        }
      })
    }

    // when more fields are added
    if (type === 'block_actions' && action.block_id === 'manage_fields') {
      let updatedBlocks
      let _buttons

      if (action.action_id === 'add') {
        _buttons = blocks.pop()
        if (blocks.length === 3) {
          _buttons.elements.push(removeButton)
        }
        updatedBlocks = [...blocks, ..._blocks(ref + 1), _buttons]
      } else {
        _buttons = blocks.pop()
        blocks.splice(-3)
        if (blocks.length === 3) {
          updatedBlocks = [...blocks, button]
        } else {
          updatedBlocks = [...blocks, _buttons]
        }
      }
      const private_metadata = JSON.stringify({ ref: ref + 1, response_url, command, channel_id })
      return web.views.update({
        view_id,
        hash,
        view: {
          private_metadata,
          'type': 'modal',
          'title': {
            'type': 'plain_text',
            'text': 'Bday details'
          },
          'blocks': updatedBlocks,
          'close': {
            'type': 'plain_text',
            'text': 'Nevermind'
          },
          'submit': {
            'type': 'plain_text',
            'text': 'Send'
          },
        },
      })
    }

    // upon modal submission
    if (type === 'view_submission') {
      // send to every member in #general excluding bday person
      const { members } = await web.conversations.members({ channel: channel_id })

      for (let [user_index, { id }] of Object.entries(data)) {
        members.splice(members.findIndex((m) => m === id), 1)
        const { user: { real_name } } = await web.users.info({ user: id })
        data[user_index].fullName = real_name
      }

      const bdayData = Object.values(data)
      const { text, blocks, confirmation } = signMessage(bdayData, sender)

      // return web.conversations.open({ users: members.toString() })
      return Promise.all(
        members.map((channel) => web.chat.postMessage({
          channel,
          text,
          blocks,
        }))
      ).then(() => {
        // notify user invitation has been sent
        return axios.post(response_url, {
          response_type: 'ephemeral',
          blocks: confirmation
        })
      }).catch((e) => {
        return axios.post(response_url, {
          response_type: 'ephemeral',
          text: `Something went wrong: ${e}.`,
        })
      })
    }
  }

  // send card to bday user
  if (command.includes('send') && command.includes('to')) {
    const R = /<(?<MIRO_URL>.*)> to <@(?<BDAY_USER_ID>.*)\|(?<BDAY_USER_NAME>.*)>/
    const matches = command.match(R)
    // notify user of invalid input
    if (!matches) {
      return invalidInputNotice(response_url, command)
    }
    // send to bday user
    const { groups: { MIRO_URL, BDAY_USER_ID } } = matches
    const bdayPerson = await web.users.info({ user: BDAY_USER_ID })
    const { user: { real_name: bdayPersonFullName } } = bdayPerson

    const renderedText = (!matchesWithOptMessage)
      ? 'Hope you have a wonderful day and eat lots of cake on behalf of all of us! :birthday:'
      : matchesWithOptMessage['groups']['CUSTOM_MESSAGE']
    return web.chat.postMessage({
      channel: BDAY_USER_ID,
      text: [
        `:tada: Happy Birthday ${bdayPersonFullName}! :tada:`,
        renderedText,
        `Click :point_right: <${MIRO_URL}|here> :point_left: to see the birthday card!`,
        `- From <@${sender}> on behalf of EQ`
      ].join('\n'),
      blocks: [
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              `:birthday: HAPPY BIRTHDAY @${BDAY_USER_NAME}!!! :tada: :tada: :tada:`,
              `:birthday: Visit ${MIRO_URL} to see your birthday card!`,
            ].join('\n'),
          },
        },
        {
          'type': 'context',
          'elements': [
            {
              'type': 'mrkdwn',
              'text': `From <@${sender}> on behalf of EQ`,
            }
          ]
        }
      ]
    })
      .then(() => {
        // notify user bday card has been sent
        return axios.post(response_url, {
          response_type: 'ephemeral',
          blocks: [
            { type: 'divider' },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `Brithday link ${MIRO_URL} has been sent to *${BDAY_USER_NAME}*!`,
              },
            },
          ],
        })
      })
      .catch((e) => {
        return axios.post(response_url, {
          response_type: 'ephemeral',
          text: `Something went wrong: ${e}.`,
        })
      })
  }

  // announce in channel
  if (command.includes('celebrate') && command.includes('for')) {
    // make sure to execute command from #general
    if (channel_name !== 'general') {
      return confirmChannel(response_url, 'celebrate', 'general')
    }
    const R = /celebrate for <@.*\|(?<BDAY_USER_NAME>.*)>/
    const matches = command.match(R)
    // notify user of invalid input
    if (!matches) {
      return invalidInputNotice(response_url, command)
    }
    // send to bday user
    const { groups: { BDAY_USER_NAME } } = matches
    return axios.post(response_url, {
      response_type: 'in_channel',
      blocks: [
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              ':tada: Birthday Aler :tada:',
              `@here It's @${BDAY_USER_NAME}'s birthday today!!! :birthday:`,
              'Lets warm up their day with some wishes/emojis/gifs! :smile:',
            ].join('\n'),
          },
        },
      ],
    })
  }

  // default return for missing params
  return axios.post(response_url, {
    response_type: 'ephemeral',
    blocks: [
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Oops! Missing some required keywords! Please see the following guide on how to use the */bday* command:'
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            '(1) */bday* sign <URL> for @bday-user',
            '(2) */bday* send <URL> to @bday-user',
            '(3) */bday* celebrate for @bday-user',
          ].join('\n'),
        },
      },
    ],
  })
}

const route = (req, res) => {
  const {
    text = '',
    response_url,
    channel_id,
    user_id,
    trigger_id,
    payload,
  } = req.body

  const validCmd = text.match(/sign|send|celebrate/)
  if (text !== '' && !validCmd) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `"${text}" not supported.`
    })
  }

  // from initial slash command trigger
  const payloadSlash = { 'command': text, response_url, channel_id, sender: user_id, trigger_id }

  // from modal interactions only
  let payloadSign
  if (payload) {
    const {
      type,
      view: { id, hash, private_metadata, state: { values }, blocks },
      actions,
      user: { id: sender }
    } = JSON.parse(payload)

    let data
    // validate input from modal
    if (type === 'view_submission') {
      /**
          values = {
            bday_person_1: { input: { type: 'users_select', selected_user: 'U01B87YFQ78' } },
            url_1: { input: { type: 'plain_text_input', value: 'test' } },
            bday_person_2: { input: { type: 'users_select', selected_user: 'U01B87YFQ78' } },
            url_2: { input: { type: 'plain_text_input', value: 'test' } }
            ...
          }
        */
      const errors = {}
      const validData = (key, input) => {
        if (!input.startsWith('http')) {
          errors[key] = 'Invalid url. Hint: make sure it includes `http`'
        }
      }

      data = Object.entries(values).reduce((acc, [key, { input }]) => {
        // key = bday_person_1 || url_1
        const user_index = key.slice(-1)
        if (acc[user_index]) {
          validData(key, input.value)
          acc[user_index] = { ...acc[user_index], url: input.value }
        } else {
          acc[user_index] = { id: input.selected_user }
        }
        return acc
      }, {})
      /**
       * data {
          '1': { id: 'U01B87YFQ78', url: 'test' },
          '2': { id: 'U01B87ZH3GW', url: 'test' }
        }
       */
      console.log(errors)
      if (Object.values(errors).length) {
        return res.status(200).json({ response_action: 'errors', errors })
      }

    }

    const {
      ref,
      response_url,
      command,
      channel_id
    } = JSON.parse(private_metadata)

    payloadSign = {
      ref,
      command,
      type,
      view_id: id,
      hash,
      response_url,
      data,
      blocks,
      action: actions ? actions[0] : [], // how to check for existence & destructure & set default value?
      channel_id,
      sender
    }
  }

  const _payload = payload ? payloadSign : payloadSlash

  if (DEPLOYED) {
    lambda.invoke({
      FunctionName: getFuncName('slack'),
      InvocationType: 'Event',
      Payload: JSON.stringify({ type: 'bday', _payload }),
    }, (err) => {
      if (err) {
        console.error(err)
        return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to process bday command' })
      }
      if (text.match(/sign|send/) && !payload) {
        return res.status(200).json({
          response_type: 'ephemeral',
          text: 'Got it! But I will need more details...'
        })
      } else if (payload && _payload.type === 'view_submission') {
        return res.status(200).json({ 'response_action': 'clear' })
      } else {
        return res.sendStatus(200)
      }
    })
  } else {
    worker(_payload).catch(console.error)
    if (text.match(/sign|send/) && !payload) {
      return res.status(200).json({
        response_type: 'ephemeral',
        text: 'Got it! But I will need more details...'
      })
    } else if (payload && _payload.type === 'view_submission') {
      // needs to have only <response_action> for modals submission
      return res.status(200).json({ 'response_action': 'clear' })
    } else {
      // modal interactions need to have acknowledgement
      return res.sendStatus(200)
    }
  }
}

module.exports = { worker, route }
