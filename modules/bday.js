const axios = require('axios')
const { WebClient } = require('@slack/web-api')
const { lambda, getFuncName  } = require('./util')


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

const worker = async ({ command, channel_id, channel_name, response_url }) => {
  // send card for members to sign
  if (command.includes('sign') && command.includes('for')) {
    // make sure to execute command from #general
    if (channel_name !== 'general') {
      return confirmChannel(response_url, 'sign', 'general')
    }
    // sign URL for @user_id|user_name
    const R = /<(?<MIRO_URL>.*)> for <@(?<BDAY_USER_ID>.*)\|(?<BDAY_USER_NAME>.*)>/
    const matches = command.match(R)
    // notify user of invalid input
    if (!matches) {
      return invalidInputNotice(response_url, command)
    }
    // send to every member in #general excluding bday person
    const { groups: { MIRO_URL, BDAY_USER_ID, BDAY_USER_NAME } } = matches
    const { members } = await web.conversations.members({ channel: channel_id })
    members.splice(members.findIndex((m) => m === BDAY_USER_ID), 1)
    return Promise.all(
      members.map(async (channel) => await web.chat.postMessage({
        channel,
        blocks: [
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                `:tada: *${BDAY_USER_NAME}'s* birthday is coming up soon! :birthday:`,
                `:tada: When you get a chance, visit ${MIRO_URL} to sign their birthday card!`,
              ].join('\n'),
            },
          },
        ],
      }))
    )
      .then(() => {
        // notify user invitation has been sent
        return axios.post(response_url, {
          response_type: 'ephemeral',
          blocks: [
            { type: 'divider' },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `Invitation to sign on ${MIRO_URL} has been sent to members in #${channel_name}!`,
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

  // send card to bday user
  if (command.includes('send') && command.includes('to')) {
    const R = /<(?<MIRO_URL>.*)> to <@(?<BDAY_USER_ID>.*)\|(?<BDAY_USER_NAME>.*)>/
    const matches = command.match(R)
    // notify user of invalid input
    if (!matches) {
      return invalidInputNotice(response_url, command)
    }
    // send to bday user
    const { groups: { MIRO_URL, BDAY_USER_ID, BDAY_USER_NAME } } = matches
    return web.chat.postMessage({
      channel: BDAY_USER_ID,
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
      ],
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
  const { text = '', response_url, channel_id, channel_name } = req.body
  const validCmd = text.match(/sign|send|celebrate/)
  if (text !== '' && !validCmd) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `"${text}" not supported.`
    })
  }

  const payload = { command: text, response_url, channel_id, channel_name }
  worker(payload).catch(console.error)
  return res.status(200).json({
    response_type: 'ephemeral',
    text: 'Got it! Processing your bday commands now...'
  })
}

module.exports = { worker, route }
