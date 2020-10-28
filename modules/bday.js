const axios = require('axios')
const { WebClient } = require('@slack/web-api')
const { lambda, getFuncName } = require('./util')
const {
  _blocks,
  button,
  removeButton,
  signMessage,
  customMessage,
  sendText,
  sendBlocks,
  sendConfirmation,
} = require('./bday-blocks')


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
  if (command.includes('send')) {
    // first iteration returns modal
    if (!type) {
      const state = {
        response_url,
        ref: 1,
        command: 'send',
      }
      return web.views.open({
        trigger_id,
        view: {
          'private_metadata': JSON.stringify(state),
          'type': 'modal',
          'title': {
            'type': 'plain_text',
            'text': 'Send bday card'
          },
          'blocks': [..._blocks(state.ref), customMessage(state.ref), button],
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
        if (blocks.length === 4) {
          _buttons.elements.push(removeButton)
        }
        updatedBlocks = [...blocks, ..._blocks(ref + 1), customMessage(ref + 1), _buttons]
      } else {
        _buttons = blocks.pop()
        blocks.splice(-4)
        if (blocks.length === 4) {
          updatedBlocks = [...blocks, button]
        } else {
          updatedBlocks = [...blocks, _buttons]
        }
      }
      const private_metadata = JSON.stringify({ ref: ref + 1, response_url, command })
      return web.views.update({
        view_id,
        hash,
        view: {
          private_metadata,
          'type': 'modal',
          'title': {
            'type': 'plain_text',
            'text': 'Send bday card'
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
      for (let [user_index, { id }] of Object.entries(data)) {
        const { user: { real_name } } = await web.users.info({ user: id })
        data[user_index].fullName = real_name
      }

      const bdayData = Object.values(data)

      // send to bday user
      return Promise.all(
        bdayData.map(({ id, url, fullName, message }) => web.chat.postMessage({
          channel: id,
          text: sendText({ url, fullName, message, sender }),
          blocks: sendBlocks({ url, fullName, message, sender }),
        }))
      ).then(() => {
        // notify user invitation has been sent
        return axios.post(response_url, {
          response_type: 'ephemeral',
          blocks: sendConfirmation(bdayData)
        })
      }).catch((e) => {
        return axios.post(response_url, {
          response_type: 'ephemeral',
          text: `Something went wrong: ${e}.`,
        })
      })
    }
  }

  // announce in channel
  if (command.includes('celebrate') && command.includes('for')) {
    // make sure to execute command from #general
    if (channel_id !== GENERAL_CHANNEL_ID) {
      const { channel: { name } } = await web.conversations.info({ channel: GENERAL_CHANNEL_ID })
      return confirmChannel(response_url, 'celebrate', name)
    }
    const R = /celebrate for <@.*\|(?<BDAY_USER_NAME>.*)>/
    const RwithMessage = /celebrate for <@.*\|(?<BDAY_USER_NAME>.*)> (?<CUSTOM_MESSAGE>.*)/
    const matches = command.match(R)
    const matchesWithOptMessage = command.match(RwithMessage)
    // notify user of invalid input
    if (!matches) {
      return invalidInputNotice(response_url, command)
    }
    // send to bday user
    const { groups: { BDAY_USER_NAME } } = matches
    const renderedText = (!matchesWithOptMessage)
      ? 'Let\'s warm up their day with some wishes/emojis/gifs! :birthday:'
      : matchesWithOptMessage['groups']['CUSTOM_MESSAGE']

    return axios.post(response_url, {
      response_type: 'in_channel',
      text: [
        ':tada: Birthday Alert :tada:',
        `@here It's @${BDAY_USER_NAME}'s birthday today!`,
        renderedText,
      ].join('\n'),
      blocks: [
        {
          'type': 'header',
          'text': {
            'type': 'plain_text',
            'text': ':tada: Birthday Alert :tada:',
            'emoji': true
          }
        },
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': `@here It's @${BDAY_USER_NAME}'s birthday today! ${renderedText}`
          }
        },
        {
          'type': 'image',
          'image_url': 'https://media.giphy.com/media/IQF90tVlBIByw/giphy.gif',
          'alt_text': 'minion birthday'
        }
      ]
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
        // key = bday_person_1 || url_1 || message_1
        const user_index = key.slice(-1)
        if (acc[user_index]) {
          if (key.includes('url')) {
            validData(key, input.value)
            acc[user_index] = { ...acc[user_index], url: input.value }
          }
          if (key.includes('message')) {
            acc[user_index] = { ...acc[user_index], message: input.value }
          }
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
