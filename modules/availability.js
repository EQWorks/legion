const axios = require('axios')
const { queryTasks } = require('@eqworks/avail-bot')
const { lambda, getFuncName  } = require('./util')

const { DEPLOYED = false } = process.env
const ASANA_LINK = 'https://app.asana.com/0/1152701043959235/timeline'
const COMMAND_MAP = {
  user: 'userName',
  section: 'sectionName',
}
const SECTIONS = ['remote', 'vacation', 'in office']

const worker = async ({ response_url, command, value }) => {
  // /avail (gets all)
  // /avail user:[name]
  // /avail section:[section]
  // /avail [section | name] checks ENUM first then assumes it's a name and checks
  // provide feedback in response e.g. "Checking availability for section: In Office"
  if (command !== '' && !COMMAND_MAP[command]) {
    return axios.post(response_url, {
      response_type: 'ephemeral',
      text: `Sorry, searching by '${command}' is not supported`,
    })
  }
  const params = {}
  if (COMMAND_MAP[command]){
    params[COMMAND_MAP[command]] = value
  }
  const tasks = await queryTasks(params)
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
  return axios.post(response_url, {
    response_type: 'ephemeral',
    blocks: [
      { type: 'section', text: { type: 'plain_text', emoji: true, text: 'Team Avail' } },
      ...Object.values(bySection).map(({ text, peepo }) => ([
        { type: 'section', text: { type: 'plain_text', emoji: true, text } },
        ...peepo.map(({ name, routine }) => ({
          type: 'plain_text',
          text: `${name}${routine ? ' (Routine)' : ''}`,
        })).reduce((chunk, item, index) => {
          // working around 10 element limit from Slack Block
          const chunkIndex = Math.floor(index / 10)

          if (!chunk[chunkIndex]) {
            chunk[chunkIndex] = { type: 'context', elements: [] }
          }

          chunk[chunkIndex].elements.push(item)

          return chunk
        }, []),
      ])).flat(),
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
}

const route = (req, res) => {
  const { text = '', response_url } = req.body

  let command = ''
  let value
  if (text.indexOf(':') > 0) {
    ([command, value] = text.split(':').map(v => v.trim()))
  } else if (text !== '') {
    if(SECTIONS.includes(text)) {
      command = 'section'
    } else {
      command = 'user'
    }
    value = text
  }
  const payload = { command, value, response_url }
  if (DEPLOYED) {
    lambda.invoke({
      FunctionName: getFuncName('avail'),
      InvocationType: 'Event',
      Payload: JSON.stringify(payload),
    }, (err) => {
      if (err) {
        console.error(err)
        return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to check availability' })
      }
      return res.status(200).json({ response_type: 'ephemeral', text: 'Checking Dev Availability...' })
    })
  } else {
    worker(payload).catch(console.error)
    return res.status(200).json({ response_type: 'ephemeral', text: 'Checking Dev Availability...' })
  }
}


module.exports = { worker, route }
