// TODO: refactor to individual ping listner
const axios = require('axios')
const { WebClient } = require('@slack/web-api')

const { lambda, getFuncName  } = require('../lib/util')

const { DEPLOYED = false } = process.env

const token = process.env.SLACK_OAUTH
const web = new WebClient(token)


const THREAD_HIGHLIGHTS = [
  {
    text: 'Summary',
    tag: '?!summary',
  },
  {
    text: 'TODOs',
    tag: '?!TODO',
  },
  {
    text: 'Questions',
    tag: '?!question',
  },
  {
    text: 'Links',
    tag: '?!link'
  },
]

const TAG_REPLACE = new RegExp(THREAD_HIGHLIGHTS.map(({ tag }) => `(${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join('|'), 'g')

const worker = async ({ command, search, user_id, response_url, channel_name, channel_id }) => {
  if (command === 'threads') {
    let finalName = channel_name
    if (channel_name === 'privategroup') {
      const { channels } = await web.conversations.list({ types: 'private_channel' })
      finalName = (channels.find(o => o.id === channel_id) || { name: finalName }).name
    }
    // TODO: `![tag]` should be passed in and this used as default!!
    // after:${new Date().toISOString().substring(0, 7)}-${new Date().getDate() - 1}
    const result = await web.search.messages({
      query: `${search} in:${finalName}`,
    })
    // The result contains an identifier for the message, `ts`.
    // thread messages normally use thread_ts
    // search.messages does not return this, so make an extra call to check
    let threads = await Promise.all(result.messages.matches.map(async ({ text, permalink, ts }) => {
      const thread = await web.conversations.replies({ channel: channel_id, ts })
      if (thread.messages.length > 1) {
        // search each message for highlight tags and return text
        const highlights = THREAD_HIGHLIGHTS.map(({ tag, text }) => ({
          text,
          content: thread.messages
            .filter(({ text }) => text.indexOf(tag) >= 0)
            .map(({ text }) => text.replace(TAG_REPLACE, '')),
        })).filter(({ content }) => content.length)
        return { text, permalink, replies: thread.messages.length - 1, highlights }
      } else {
        return false
      }
    }))
    threads = threads.filter(thread => thread)
    return axios.post(response_url, {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${threads.length ? `Showing threads for *${search}*` : 'No threads found.'}`
          },
        },
        {
          type: 'divider',
        },
        ...threads.map(({ text, replies, permalink, highlights }) => ([
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Thread:* ${text.replace(search, '')} - ${replies} msgs - <${permalink}| See Thread>`,
            }
          },
          {
            type: 'context',
            elements: highlights.length ? highlights.map(({ text, content }) => ({
              type: 'mrkdwn',
              text: `*${text}* ${content.map(o => `\n• ${o.trim()}`).join('')}`
            })) : [{ type: 'plain_text', text: 'No highlights' }],
          },
        ])).flat()
      ],
    })
  } else {
    const result = await web.search.messages({
      query: `${search} after:${new Date().toISOString().substring(0, 7)}-${new Date().getDate() - 1}`,
    })

    return axios.post(response_url, {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${search === user_id ? 'You' : 'They'} were pinged ${result.messages.matches.length} time(s) today!`,
          },
        }
      ],
    })
  }

}

const route = (req, res) => {
  const { user_id, text, response_url, channel_name, channel_id } = req.body
  const { command } = req.query
  /*
    {
      token: 'abc',
      team_id: 'T1FDR4NG3',
      team_domain: 'eqworks',
      channel_id: 'CCCB6QD9S',
      channel_name: 'bot-cmd',
      user_id: 'UDKQUMTNV',
      user_name: 'user_id',
      command: '/threads',
      text: '',
      response_url: 'https://hooks.slack.com/commands/T1FDR4NG3/957681200533/G4WCc5MZfRM6kOFxCtd1lpEG',
      trigger_id: '957681200677.49467158547.bcd8bacc8087edc008d15d200bfdad49'
    }
  */
  let search = text
  if (command === 'pings') {
    search = text === '' ? user_id : text.replace('<','').split('|')[0]
  } else {
    search = text
  }
  const payload = {
    command,
    user_id,
    search,
    channel_id,
    channel_name,
    response_url,
  }
  if (DEPLOYED) {
    lambda.invoke({
      FunctionName: getFuncName('slack'),
      InvocationType: 'Event',
      Payload: JSON.stringify({ type: 'slack', payload }),
    }, (err) => {
      if (err) {
        console.error(err)
        return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to check slack' })
      }
      return res.status(200).json({ response_type: 'ephemeral', text: `Checking slack ${command}...` })
    })
  } else {
    worker(payload).catch(console.error)
    return res.status(200).json({ response_type: 'ephemeral', text: `Checking slack ${command}...` })
  }
}


module.exports = { worker, route }
