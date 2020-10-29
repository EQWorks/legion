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
  defaultBlock,
  celebrateBlocks,
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
  if (command === 'sign') {
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
          'callback_id': 'bday',
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
      const _buttons = blocks.pop()

      if (action.action_id === 'add') {
        if (blocks.length === 3) {
          _buttons.elements.push(removeButton)
        }
        updatedBlocks = [...blocks, ..._blocks(ref + 1), _buttons]
      } else {
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
          'callback_id': 'bday',
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
  if (command === 'send') {
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
          'callback_id': 'bday',
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
      const _buttons = blocks.pop()

      if (action.action_id === 'add') {
        if (blocks.length === 4) {
          _buttons.elements.push(removeButton)
        }
        updatedBlocks = [...blocks, ..._blocks(ref + 1), customMessage(ref + 1), _buttons]
      } else {
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
          'callback_id': 'bday',
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
      blocks: celebrateBlocks(BDAY_USER_NAME, renderedText),
    })
  }

  // default return for missing params
  return axios.post(response_url, {
    response_type: 'ephemeral',
    blocks: defaultBlock,
  })
}

const route = (req, res) => {
  const {
    text = '',
    response_url,
    channel_id,
    user_id,
    trigger_id,
  } = req.body

  const validCmd = text.match(/sign|send|celebrate/)
  if (text !== '' && !validCmd) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `"${text}" not supported.`
    })
  }

  const payload = { 'command': text, response_url, channel_id, sender: user_id, trigger_id }

  if (DEPLOYED) {
    lambda.invoke({
      FunctionName: getFuncName('slack'),
      InvocationType: 'Event',
      Payload: JSON.stringify({ type: 'bday', payload }),
    }, (err) => {
      if (err) {
        console.error(err)
        return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to process bday command' })
      }
      if (text.match(/sign|send/)) {
        return res.status(200).json({
          response_type: 'ephemeral',
          text: 'Got it! But I will need more details...'
        })
      } else {
        // celebrate doens't need more details yet
        return res.sendStatus(200)
      }
    })
  } else {
    worker(payload).catch(console.error)
    if (text.match(/sign|send/)) {
      return res.status(200).json({
        response_type: 'ephemeral',
        text: 'Got it! But I will need more details...'
      })
    } else {
      // celebrate doens't need more details yet
      return res.sendStatus(200)
    }
  }
}
module.exports = { worker, route }
