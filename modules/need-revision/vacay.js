const axios = require('axios')
const { getTasksForProject } = require('@eqworks/avail-bot')

const { legionLambda: lambda, getFuncName  } = require('../lib/util')

const { DEPLOYED = false } = process.env

const STATUS_BTN_MAP = {
  'Approved': {
    text: 'Set Pending',
    style: 'danger',
    gid: field => field.enum_options.find(o => o.name === 'Pending').gid
  },
  'Confirmed by Employee': {
    text: 'Approve',
    style: 'primary',
    gid: field => field.enum_options.find(o => o.name === 'Approved').gid
  },
  'Pending': {
    text: 'Confirm',
    style: 'primary',
    gid: field => field.enum_options.find(o => o.name === 'Confirmed by Employee').gid
  }
}

const getStatusButton = (field, status, taskGid) => {
  const { text, style, gid } = STATUS_BTN_MAP[status]
  return {
    accessory: {
      type: 'button',
      text: {
        type: 'plain_text',
        emoji: true,
        text: `${text}`,
      },
      style: `${style}`,
      value: `vacay // ${taskGid} // ${field.gid} // ${gid(field)}`
    }
  }
}

const worker = async ({ response_url }) => {
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
    sectionName: 'Vacation',
    now: false,
    rawParams: {
      opt_fields: 'start_on,due_on,due_at,name,notes,assignee.name,custom_fields,completed',
      'due_on.after': date.getFullYear() + '-12-31'
    },
    // customFieldSearches: [{ name: 'Status', search: { type: 'value', value: 'Pending' } }]
  }
  const vacation = await getTasksForProject(params)

  if (!vacation) {
    return axios.post(response_url, {
      response_type: 'ephemeral',
      blocks: [
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': 'No Vacation Found'
          }
        },
      ]
    })
  }
  const statusField = vacation[0].custom_fields.find(o => o.name === 'Status')
  const {
    true: summaryVacay,
    false: outstandingVacay,
  } = vacation.reduce((agg, t) => {
    const {
      completed,
      assignee: { gid: userId, name },
      notes,
      custom_fields,
      start_on,
      due_on,
      gid,
    } = t
    if (completed) {
      // TODO: handle Status (e.g. what if it was complete, but Pending)
      // if start_on, then it's a duration, else 1 day
      agg[completed][name] = (agg[completed][name] || 0) + (start_on ? (
        (
          new Date(due_on.replace('-','/')).getTime()
          -
          Math.max(
            new Date(date.getFullYear() + '/12/31').getTime(),
            new Date(start_on.replace('-','/')).getTime()
          )
        ) / (1000*60*60*24)) : 1)
    } else {
      const status = custom_fields.find(o => o.name === 'Status')
      // this filters unset ('-') tasks
      if (status && status.enum_value) {
        if (!agg[completed][status.enum_value.name]) {
          agg[completed][status.enum_value.name] = []
        }
        agg[completed][status.enum_value.name].push({
          gid,
          userId,
          date: start_on ? `${start_on} - ${due_on}` : due_on,
          name,
          notes,
        })
      }
    }
    return agg
  }, { true: {}, false: {} })

  return axios.post(response_url, {
    response_type: 'ephemeral',
    blocks: [
      {
        'type': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': 'Dev Team ~Slacking~ Vacation'
        }
      },
      { 'type': 'divider' },
      {
        'type': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': '*--------- Summary (YTD) ---------*',
        }
      },
      {
        'type': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': `${Object.entries(summaryVacay).map(([user, total]) => `\n• *${user}:* ${total} day(s)`).join('')}`,
        }
      },
      { 'type': 'divider' },
      {
        'type': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': '*--------- Upcoming Vacay ---------*',
        }
      },
      ...Object.entries(outstandingVacay).map(([status, entries]) => ([
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': `*--- _${status}_ ---*`
          }
        },
        ...entries.map(({ name, notes, date, gid }) => ({
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': `• *${name}:* ${date}\n${notes ? `_${notes}_` : '' }`
          },
          ...getStatusButton(statusField, status, gid)
        })),
        { type: 'divider' },
      ])).flat(),
    ],
  })
}

const route = (req, res) => {
  const { response_url } = req.body
  const payload = { response_url }
  if (DEPLOYED) {
    lambda.invoke({
      FunctionName: getFuncName('slack-worker'),
      InvocationType: 'Event',
      Payload: JSON.stringify({ type: 'vacay', payload }),
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
