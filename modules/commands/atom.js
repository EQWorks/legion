const axios = require('axios')

const { invokeSlackWorker, lambda } = require('../lib/util')


const formatMaint = (maint) => {
  /*
    Sample maint:
    {
      "west:who": "me",
      "west:bidder": 1,
      "west:agent": 1,
      "east:who": "me",
      "east:bidder": 0,
      "east:agent": 0
    }
  */
  // group by region
  const regions = Object.keys(maint).reduce((acc, key) => {
    const [region, item] = key.split(':')
    acc[region] = { ...(acc[region] || {}), [item]: maint[key] }
    return acc
  }, {})
  const formatRegion = (region) => {
    // find which components are in maintenance
    const inMaint = Object.keys(regions[region]).filter(key => key !== 'who' && regions[region][key] === 1)
    const { who } = regions[region]
    return `ATOM \`${region}\` region is in maintenance set by \`${who === 'me' ? 'bot' : who}\` with components: ${inMaint.map(i => `\`${i}\``).join(', ')}`
  }
  const items = []
  if (regions.east.bidder || regions.east.agent) {
    items.push(formatRegion('east'))
  }
  if (regions.west.bidder || regions.west.agent) {
    items.push(formatRegion('west'))
  }
  if (items.length === 0) {
    return 'ATOM not in maintenance'
  }
  return items.join('\n')
}

const formatHeartbeat = (heartbeat) => {
  /*
    Sample heartbeat:
    {
      "east": {
        "detail": {
          "east:bidder:172.31.4.221": true,
          "east:bidder:172.31.12.215": true,
          "east:bidder:172.31.39.1": true,
          "east:bidder:172.31.7.234": true,
          "east:bidder:172.31.71.76": true,
          "east:bidder:172.31.43.82": true,
          "east:bidder:172.31.68.101": true,
          "east:bidder:172.31.38.50": true,
          "east:adserver:10.24.14.237": true,
          "east:adserver:10.24.0.60": true,
          "east:agent:172.31.73.212": true,
          "east:agent:172.31.7.54": true,
          "east:agent:172.31.35.234": true,
          "east:agent:172.31.78.121": true,
          "east:agent:172.31.39.19": true,
          "east:agent:172.31.7.140": true,
          "east:pacing:10.24.12.163": true
        },
        "heartbeat": {
          "agent": true,
          "bidder": true,
          "adserver": true,
          "pacing": true
        },
        "healthy": true,
        "hash": []
      },
      "west": {
        "detail": {
          "west:pacing:10.24.12.163": true
        },
        "heartbeat": {
          "agent": false,
          "bidder": false,
          "adserver": false,
          "pacing": true
        },
        "healthy": false,
        "hash": []
      }
    }
  */
  if (heartbeat.east.healthy && heartbeat.west.healthy) {
    return 'Both ATOM regions are healthy'
  }
  const formatRegion = (region) => {
    // find which components are unhealthy
    const unhealthy = Object.keys(heartbeat[region].heartbeat).filter(key => !heartbeat[region].heartbeat[key])
    return `ATOM \`${region}\` region has unhealthy components: ${unhealthy.map(i => `\`${i}\``).join(', ')}`
  }
  const items = []
  if (!heartbeat.east.healthy) {
    items.push(formatRegion('east'))
  }
  if (!heartbeat.west.healthy) {
    items.push(formatRegion('west'))
  }
  return items.join('\n')
}

const worker = async ({ cmd, args, response_url, slash, user_id, user_name }) => {
  let text = `Unable to execute \`${slash}\``
  if (cmd === 'status') {
    // obtain maintenance and heartbeat status from Anubis lambda
    const [maint, heartbeat] = await Promise.all([
      // TODO: anubis only has dev stage for now
      lambda.invoke({ FunctionName: `anubis-dev-maintenance_check` }).promise(),
      lambda.invoke({ FunctionName: `anubis-dev-heartbeat_check_all` }).promise(),
    ])
    const items = [
      `*Maintenance*: ${formatMaint(JSON.parse(maint.Payload))}`,
      `*Heartbeat*: ${formatHeartbeat(JSON.parse(heartbeat.Payload))}`,
    ]
    text = items.join('\n')
  } else if (cmd.startsWith('maint-')) {
    const flip = cmd.split('-')[1] === 'on' ? 1 : 0 // 1 = on, 0 = off
    const payload = { flip, who: user_name }
    // parse geo and service from args
    args.forEach(arg => {
      const [key, value] = arg.split(':').map(v => v.trim().toLowerCase())
      if (key === 'geo') {
        if (['east', 'west'].includes(value)) {
          payload.geo = value
        }
      }
      if (key === 'service') {
        if (['bidder', 'agent'].includes(value)) {
          payload.service = value
        }
      }
    })
    // invoke anubis lambda to set maintenance
    const maint = await lambda.invoke({
      FunctionName: `anubis-dev-maintenance_write`,
      Payload: JSON.stringify(payload),
    }).promise()
    console.log(maint.Payload)
    text = `Maintenance set by <@${user_id}> to ${flip === 1 ? 'on' : 'off'} for regions: \`${payload.geo || 'all'}\` and services: \`${payload.service || 'all'}\``
  }
  return axios.post(response_url, { response_type: 'in_channel', text })
}

const CMDS = ['status', 'maint-on', 'maint-off']

const listener = async ({ command, ack }) => {
  const { response_url, text, command: _command, user_id, user_name } = command
  const [cmd, ...args] = text.split(/\s+/).filter(v => v.trim()).map(v => v.trim().toLowerCase())

  if (!CMDS.includes(cmd)) {
    await ack({
      text: `Unknown command: \`${_command} ${text}\``,
      response_type: 'ephemeral',
    })
    return
  }

  const slash = `${_command} ${text}` // original request slash command
  const payload = { cmd, args, response_url, slash, user_id, user_name }

  await invokeSlackWorker({ type: 'atom', payload }) // underlying lambda invoke is async
  await ack({ text: `Executing \`${slash}\`. This could take a while...`, response_type: 'in_channel' })
}

module.exports = { worker, listener }
