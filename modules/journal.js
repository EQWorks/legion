const axios = require('axios')

// mock modules
const mockjournals = []
const mocklwd = []
const mockdes = []

const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const getJournals = async () => {
  await timeout(3000)
  return mockjournals
}
const getFieldInfo = async (field) => {
  await timeout(3000)
  if (field === 'lwd') return mocklwd
  if (field === 'des') return mockdes
}
// end of mock modules

const COMMANDS = ['last workday', 'description']

const worker = async ({ command, response_url }) => {
  let journalBlocks
  const journals = await getJournals()
  const lwd = await getFieldInfo('lwd')
  const des = await getFieldInfo('des')

  if (command === 'last workday') {
    journalBlocks = lwd.map((j) => (
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `> *${j.name}:*`,
            j.lastWorkday,
          ].join('\n'),
        },
      }
    ))
  } else if (command === 'description') {
    journalBlocks = des.map((j) => (
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `> *${j.name}:*`,
            j.description,
          ].join('\n'),
        },
      }
    ))
  } else {
    journalBlocks = journals.map((j) => (
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `> *${j.name}:*`,
            j.incompleteSubTasks.map((t) => `* ${t.name}`).join('\n'),
            j.completedSubTasks.map((t) => `* ${t.name}`).join('\n'),
          ].join('\n'),
        },
      }
    ))
  }

  return axios.post(response_url, {
    response_type: 'in_channel',
    blocks: [
      { type: 'divider' },
      ...journalBlocks
    ]
  })
}

const route = (req, res) => {  
  const { text = '', response_url } = req.body
  if (text !== '' && !COMMANDS.includes(text)) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `"${text}" not supported.`
    })
  }

  const payload = { command: text, response_url }
  worker(payload).catch(console.error)
  return res.status(200).json({
    response_type: 'ephemeral',
    text: 'Got it! Asking asana for journals now...'
  })
}

module.exports = { worker, route }
