const axios = require('axios')
const { WebClient } = require('@slack/web-api')
const { lambda, getFuncName  } = require('./util')

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

const worker = async ({ command, channel_id, channel_name, response_url, user_id }) => {
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
    const bdayPerson = await web.users.info({ user: BDAY_USER_ID })
    const bdayPersonFullName = bdayPerson.user.real_name
    const { members } = await web.conversations.members({ channel: channel_id })
    members.splice(members.findIndex((m) => m === BDAY_USER_ID), 1)
    return Promise.all(
      members.map(async (channel) => await web.chat.postMessage({
        channel,
        text: [
          `:tada: Birthday Alert for ${bdayPersonFullName} :tada:`,
          `*${bdayPersonFullName}'s* birthday is coming up soon! Take some time and leave a nice message for ${bdayPersonFullName} to read. Thanks! :smile:`,
          `Click :point_right: <${MIRO_URL}|here> :point_left: to sign! Instructions are found inside the card.`
        ].join('\n'),
        blocks: [
            {
              'type': 'header',
              'text': {
                'type': 'plain_text',
                'text': `:tada: Birthday Alert for ${bdayPersonFullName} :tada:`,
                'emoji': true
              }
            },
            {
              'type': 'section',
              'text': {
                'type': 'mrkdwn',
                'text':  `*${bdayPersonFullName}*'s birthday is coming up soon! Take some time and leave a nice message for ${bdayPersonFullName} to read. Thanks! :smile:`
              }
            },
            {
              'type': 'section',
              'text': {
                'type': 'mrkdwn',
                'text': `Click :point_right: <${MIRO_URL}|here> :point_left: to sign! Instructions are found inside the card.`
              }
            }
          ]
      }))
    )
      .then(() => {
        // notify user invitation has been sent
        return axios.post(response_url, {
          response_type: 'ephemeral',
          blocks: [
            {
              'type': 'header',
              'text': {
                'type': 'plain_text',
                'text': `Card has been sent for signing to everyone except ${bdayPersonFullName}! :tada:`,
                'emoji': true
              }
            },
            {
              'type': 'section',
              'text': {
                'type': 'mrkdwn',
                'text': 'Thanks for spreading some love! :smile:'
              }
            },
            {
              'type': 'divider'
            },
            {
              'type': 'context',
              'elements': [
                {
                  'type': 'plain_text',
                  'text': `Card link: ${MIRO_URL}`,
                  'emoji': true
                }
              ]
            }
            
          ]
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
    const RwithMessage = /<(?<MIRO_URL>.*)> to <@(?<BDAY_USER_ID>.*)\|(?<BDAY_USER_NAME>.*)> (?<CUSTOM_MESSAGE>.*)/
    const matches = command.match(R)
    const matchesWithOptMessage = command.match(RwithMessage)

    // notify user of invalid input
    if (!matches) {
      return invalidInputNotice(response_url, command)
    }
    // send to bday user
    const { groups: { MIRO_URL, BDAY_USER_ID, BDAY_USER_NAME } } = matches
    const sender = await web.users.info({ user: user_id })
    const bdayPerson = await web.users.info({ user: BDAY_USER_ID })
    const bdayPersonFullName = bdayPerson.user.real_name

    const renderedText = (!matchesWithOptMessage)
      ? 'Hope you have a wonderful day and eat lots of cake on behalf of all of us! :birthday:'
      : matchesWithOptMessage['groups']['CUSTOM_MESSAGE']
    return web.chat.postMessage({
      channel: BDAY_USER_ID,
      text: [
        `:tada: Happy Birthday ${bdayPersonFullName}! :tada:`,
        renderedText,
        `Click :point_right: <${MIRO_URL}|here> :point_left: to see the birthday card!`,
        `- From ${sender.user.real_name} on behalf of EQ`
      ].join('\n'),
      blocks: [
        {
          'type': 'header',
          'text': {
            'type': 'plain_text',
            'text': `:tada: Happy Birthday ${bdayPersonFullName}! :tada:`,
            'emoji': true
          }
        },
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': renderedText
          }
        },
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': `Click :point_right: <${MIRO_URL}|here> :point_left: to see the birthday card!`
          }
        },
        {
          'type': 'divider'
        },
        {
          'type': 'context',
          'elements': [
            {
              'type': 'plain_text',
              'text': `From ${sender.user.real_name} on behalf of EQ`,
              'emoji': true
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
            {
              'type': 'header',
              'text': {
                'type': 'plain_text',
                'text': `Card has been sent to ${bdayPersonFullName}! :tada:`,
                'emoji': true
              }
            },
            {
              'type': 'section',
              'text': {
                'type': 'mrkdwn',
                'text': 'Thanks for spreading some love! :smile:'
              }
            },
            {
              'type': 'divider'
            },
            {
              'type': 'context',
              'elements': [
                {
                  'type': 'plain_text',
                  'text': `Card link: ${MIRO_URL}`,
                  'emoji': true
                }
              ]
            }
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
          "type": "image",
          "image_url": "https://media.giphy.com/media/IQF90tVlBIByw/giphy.gif",
          "alt_text": "minion birthday"
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
  const { text = '', response_url, channel_id, channel_name, user_id } = req.body
  const validCmd = text.match(/sign|send|celebrate/)
  if (text !== '' && !validCmd) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `"${text}" not supported.`
    })
  }

  const payload = { command: text, response_url, channel_id, channel_name, user_id }

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
      return res.status(200).json({ response_type: 'ephemeral', text: 'Got it! Processing your bday commands now...' })
    })
  } else {
    worker(payload).catch(console.error)
    return res.status(200).json({
      response_type: 'ephemeral',
      text: 'Got it! Processing your bday commands now...'
    })
  }
}

module.exports = { worker, route }
