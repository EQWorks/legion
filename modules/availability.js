const express = require('express')
const { queryTasks } = require('@eqworks/avail-bot')
const { verifySlack } = require('./middleware')

const ASANA_LINK = 'https://app.asana.com/0/1152701043959235/timeline'


const router = express.Router()

const COMMAND_MAP = {
  user: 'userName',
  section: 'sectionName',
}

router.all('/', verifySlack, (req, res, next) => {
  const { text = '' } = req.body || {}
  const [command, value] = text.split(':').map(v => v.trim())
  if (command !== '' && !COMMAND_MAP[command]) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `Sorry, searching by '${command}' is not supported`,
    })
  }
  const params = {}
  if (COMMAND_MAP[command]){
    params[COMMAND_MAP[command]] = value
  }
  queryTasks(params)
    .then(tasks => {
      const byAssignee = {}
      tasks.forEach((t) => {
        const {
          assignee: { gid, name },
          name: text,
          memberships: [{ section: { gid: section } }],
        } = t
        const routine = text.toLowerCase().includes('routine')
        if (!byAssignee[gid] || !routine) {
          byAssignee[gid] = { name, text, routine, section }
        }
      })
      const bySection = {}
      Object.values(byAssignee).forEach(({ name, text, routine, section }) => {
        if (!bySection[section]) {
          bySection[section] = {
            text: text.split(':')[0].split(' ')[0],
            peepo: [],
          }
        }
        bySection[section].peepo.push({ text, name, routine })
      })
      return res.status(200).json({
        response_type: 'ephemeral',
        blocks: [
          { type: 'section', text: { type: 'plain_text', emoji: true, text: 'Dev Avail' } },
          ...[].concat.apply([], Object.values(bySection).map(({ text, peepo }) => ([
            { type: 'section', text: { type: 'plain_text', emoji: true, text } },
            {
              type: 'context',
              elements: peepo.map(({ name, routine }) => ({
                type: 'plain_text',
                text: `${name}${routine ? ' (Routine)' : ''}`,
              })),
            },
          ]))),
          { type: 'divider' },
          {
            type: 'context',
            elements: [
              { type: 'plain_text', emoji: true, text: `:clock9: ${new Date().toISOString()}` },
              { type: 'mrkdwn', text: `<${ASANA_LINK}|Timeline>` },
            ],
          },
        ],
      })
    })
    .catch(next)
})


module.exports = router
