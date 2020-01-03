const express = require('express')
const { queryTasks } = require('@eqworks/avail-bot')
const { verifySlack } = require('./middleware')


const router = express.Router()

const COMMAND_MAP = {
  user: 'userName',
  section: 'sectionName',
}

router.all('/', verifySlack, (req, res, next) => {
  const { text = '' } = req.body || {}
  const [command, value] = text.split(':')
  if (!COMMAND_MAP[command]) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `Sorry, searching by '${command}' is not supported`,
    })
  }
  queryTasks({ [COMMAND_MAP[command]]: value })
    .then(tasks => {
      return res.status(200).json({
        response_type: 'in_channel',
        text: `\`\`\`${tasks.map(t => t.name).join('\n')}\`\`\``
      })
    })
    .catch(next)
})


module.exports = router
