const axios = require('axios')
const { getTasksForProject } = require('@eqworks/avail-bot')
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
  // if (command !== '' && !COMMAND_MAP[command]) {
  //   return axios.post(response_url, {
  //     response_type: 'ephemeral',
  //     text: `Sorry, searching by '${command}' is not supported`,
  //   })
  // }
  // const params = {}
  // if (COMMAND_MAP[command]){
  //   params[COMMAND_MAP[command]] = value
  // }
  // const params = {
  //   sectionName: 'vacation',
  //   now: false,
  //   rawParams: {
  //     opt_fields: 'start_on,due_on,due_at,name,notes,assignee.name,custom_fields',
  //     completed: false,
  //   },
  //   // customFieldSearches: [{ name: 'Status', search: { type: 'value', value: 'Pending' } }]
  // }
  // const tasks = await getTasksForProject(params)
  const date = new Date()
  date.setYear(date.getFullYear() - 1)
  const params = {
    sectionName: 'vacation',
    now: false,
    rawParams: {
      opt_fields: 'start_on,due_on,due_at,name,notes,assignee.name,custom_fields',
      // completed: false,
      completed: true,
      'due_on.after': date.getFullYear() + '-12-31'
    },
    // customFieldSearches: [{ name: 'Status', search: { type: 'value', value: 'Pending' } }]
  }
  const tasks = await getTasksForProject(params)
  const byUser = tasks.reduce((agg, t) => {
    const {
      assignee: { name },
      start_on,
      due_on,
    } = t
    // TODO: handle Status (e.g. what if it was complete, but Pending)
    // if start_on, then it's a duration, else 1 day
    console.log('---> ', name, start_on, due_on)
    agg[name] = (agg[name] || 0) + (start_on ? (
      (new Date(due_on.replace('-','/')).getTime() - Math.max(new Date(date.getFullYear() + '/12/31').getTime(), new Date(start_on.replace('-','/')).getTime())) / (1000*60*60*24)) : 1)
    return agg
  }, {})
  // console.log(byUser)
  // const statusTask = tasks[0].custom_fields.find(o => o.name === 'Status')
  // const byStatus = tasks.reduce((agg, t) => {
  //   const {
  //     assignee: { gid: userId, name },
  //     notes,
  //     custom_fields,
  //     start_on,
  //     due_on,
  //     gid,
  //   } = t
  //   // if start_on, then it's a duration, else 1 day
  //   const status = custom_fields.find(o => o.name === 'Status')
  //   // this filters unset ('-') tasks
  //   if (status.enum_value) {
  //     if (!agg[status.enum_value.name]) {
  //       agg[status.enum_value.name] = []
  //     }
  //     agg[status.enum_value.name].push({
  //       gid,
  //       userId,
  //       date: start_on ? `${start_on} - ${due_on}` : due_on,
  //       name,
  //       notes,
  //     })
  //   }
  //   return agg
  // }, {})
  /*
    'Approved': [...tasks],
    '': []
  */
  // const statusMap = {
  //   'Approved': {
  //     text: 'Set Pending',
  //     gid: statusTask.enum_options.find(o => o.name === 'Pending').gid,
  //     style: 'danger',
  //   },
  //   'Confirmed by Employee': {
  //     text: 'Approve',
  //     gid: statusTask.enum_options.find(o => o.name === 'Approved').gid,
  //     style: 'primary',
  //   },
  //   'Pending': {
  //     text: 'Confirm',
  //     gid: statusTask.enum_options.find(o => o.name === 'Confirmed by Employee').gid,
  //     style: 'primary',
  //   }
  // }
  // const getStatusButton = (status, gid) => {
  //   // if (status === 'Pending') {
  //   //   return {}
  //   // }
  //   // include Approve and Pending for Confirmed By Employee
  //   return {
  //     "accessory": {
  //       "type": "button",
  //       "text": {
  //         "type": "plain_text",
  //         "emoji": true,
  //         "text": `${statusMap[status].text}`,
  //       },
  //       "style": `${statusMap[status].style}`,
  //       "value": `vacay // ${gid} // ${statusTask.gid} // ${statusMap[status].gid}`
  //     }
  //   }
  // }
  return axios.post(response_url, {
    response_type: 'in_channel',
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "Dev Team ~Slacking~ Vacation"
        }
      },
      { "type": "divider" },
      ...Object.entries(byUser).map(([user, total]) => (
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `*${user}*: ${total}`,
          }
        }
      ))
      // ...Object.entries(byStatus).map(([status, entries]) => ([
      //   {
      //     "type": "section",
      //     "text": {
      //       "type": "mrkdwn",
      //       "text": `_${status}_`
      //     }
      //   },
      //   ...entries.map(({ name, notes, date, gid }) => ({
      //     "type": "section",
      //     "text": {
      //       "type": "mrkdwn",
      //       "text": `*${name}:* ${date}\n${notes}`
      //     },
      //     ...getStatusButton(status, gid)
      //   })),
      //   { type: 'divider' },
      // ])).flat(),
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
        return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to check vacation' })
      }
      return res.status(200).json({ response_type: 'ephemeral', text: 'Checking Vacation...' })
    })
  } else {
    worker(payload).catch(console.error)
    return res.status(200).json({ response_type: 'ephemeral', text: 'Checking Vacation...' })
  }
}


module.exports = { worker, route }

/*
{
  gid: '1159688855982005',
  resource_type: 'task',
  created_at: '2020-01-30T19:34:44.389Z',
  modified_at: '2020-02-15T01:22:12.955Z',
  name: 'Vacation: Shane (test)',
  notes: 'Cambodia broooooo',
  assignee: {
    gid: '1144464613086028',
    resource_type: 'user',
    name: 'Shane Stratton'
  },
  completed: false,
  assignee_status: 'inbox',
  completed_at: null,
  due_on: '2020-02-21',
  due_at: null,
  projects: [
    {
      gid: '1152701043959235',
      resource_type: 'project',
      name: 'Dev Avail'
    }
  ],
  resource_subtype: 'default_task',
  start_on: '2020-02-17',
  tags: [],
  workspace: {
    gid: '30686770106337',
    resource_type: 'workspace',
    name: 'eqworks.com'
  },
  num_hearts: 0,
  num_likes: 0,
  parent: null,
  hearted: false,
  hearts: [],
  liked: false,
  likes: [],
  followers: [
    {
      gid: '1144464613086028',
      resource_type: 'user',
      name: 'Shane Stratton'
    },
    {
      gid: '30686744339484',
      resource_type: 'user',
      name: 'Dilshan Kathriarachchi'
    }
  ],
  memberships: [ { project: [Object], section: [Object] } ],
  custom_fields: [
    {
      gid: '1159688855981996',
      name: 'Status',
      type: 'enum',
      enum_value: [Object],
      enum_options: [Array],
      enabled: true
    }
  ]
}


*/
