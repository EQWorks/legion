const axios = require('axios')

const { invokeSlackWorker, lambda, slackClient } = require('../lib/util')

const { STAGE } = process.env

const array2CSV = (data) => {
  const keys = Object.keys(data[0])
  const csv = data.map(row => keys.map(key => `"${row[key]}"`).join(','))
  return `${keys.join(',')}\n${csv.join('\n')}`
}

// replace non-alphanumeric characters
const sanitize = (str) => str.replace(/[^a-zA-Z0-9]/g, '')

const parseIDs = (params) => params.split(',')
  .map(id => id.trim())
  .filter(id => id.match(/^\d+$/))
  .map(id => parseInt(id, 10))

const getLifeTimeReport = async ({ type, params }) => {
  let payload = null
  let key = type
  let filename = 'lifetime_report.csv'
  if (['merchants', 'offers'].includes(type)) {
    payload = parseIDs(params)
  } else if (type === 'merchant') {
    key = 'merchants'
    payload = sanitize(params.trim().toLowerCase())
  }
  const response = await lambda.invoke({
    FunctionName: `paymi-report-jobs-${STAGE}-offers_lifetime_report`,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({ [key]: payload }),
  }).promise()
  filename = `${type}-lifetime-report-${[payload].flat().join('_')}-${Date.now()}.csv`
  return { ...response, filename }
}

const worker = async ({ cmd, type, params, response_url, channel_id, slash }) => {
  let text = `Unable to execute \`${slash}\``
  if (cmd === 'report') { // so far only report command is supported
    try {
      const { Payload, filename } = await getLifeTimeReport({ type, params })
      text = [
        `Report fetched: \`${filename}\``,
        `Slash command: \`${slash}\``,
      ].join('\n')
      // upload to Slack as CSV
      await slackClient.files.upload({
        channels: channel_id,
        content: array2CSV(JSON.parse(Payload).data),
        filename,
      })
    } catch (err) {
      console.error(err)
      text = `Server error while executing \`${slash}\``
    }
  }
  return axios.post(response_url, { response_type: 'in_channel', text })
}

const callPaymiReportJob = (func) => (payload) => lambda.invoke({
  FunctionName: `paymi-report-jobs-${STAGE}-${func}`,
  InvocationType: 'Event', // we delegate this fully to paymi-report-jobs side
  Payload: JSON.stringify(payload),
}).promise()
const getWeeklyOpsReport = callPaymiReportJob('weekly_ops_report')
const getRangeMemberBalances = callPaymiReportJob('range_member_balances')
const getKPIReport = callPaymiReportJob('daily_kpi_report')

const isISODate = (s) => /\d{4}-\d{2}-\d{2}/.test(s) // very crude check

const REPORT_TYPES = Object.freeze(['merchants', 'merchant', 'offers', 'weekly', 'mb', 'kpi'])

const listener = async ({ command, ack }) => {
  const { response_url, text, channel_name, channel_id, command: _command } = command
  const [, cmd, _type, _params] = text.match(/(\w+)\s+(\w+)\s(.*)/)
  if (channel_name !== 'bot-cmd' && !channel_name.toLowerCase().includes('paymi')) {
    await ack({
      text: `Command \`${cmd}\` is not available for <#${channel_id}>`,
      response_type: 'ephemeral',
    })
    return
  }
  if (cmd.toLowerCase() !== 'report') {
    await ack({
      text: `Unknown command: \`${_command} ${cmd}\``,
      response_type: 'ephemeral',
    })
    return
  }

  const type = _type.toLowerCase()
  if (!REPORT_TYPES.includes(type)) {
    await ack({
      text: `Unknown ${cmd} type: \`${_command} ${cmd} ${type}\``,
      response_type: 'ephemeral',
    })
    return
  }

  const params = _params.trim()
  if (!params) {
    await ack({
      text: `Missing params for \`${_command} ${cmd} ${type}\``,
      response_type: 'ephemeral',
    })
    return
  }

  const slash = `${_command} ${cmd} ${type} ${params}` // original request slash command
  // TODO: refactor to make the flow control less tedious
  if (type === 'weekly') {
    await getWeeklyOpsReport({ date: params, channels: channel_id }) // underlying lambda invoke is async
  } else if (type === 'mb') {
    // TODO: more comprehensive validation of input
    const [start, end] = params.split(/\s+/)
    if (!isISODate(start) || !isISODate(end)) {
      await ack({
        text: `Need both start and end dates in YYYY-MM-DD format for \`${_command} ${cmd} ${type}\``,
        response_type: 'ephemeral',
      })
      return
    }
    await getRangeMemberBalances({ channels: channel_id, start, end }) // underlying lambda invoke is async
  } else if (type === 'kpi') {
    await getKPIReport({ date: params, channels: channel_id, lite: true }) // underlying lambda invoke is async
  } else {
    const payload = { cmd, type, params, response_url, channel_id, slash }
    await invokeSlackWorker({ type: 'paymi', payload }) // underlying lambda invoke is async
  }

  await ack({ text: `Executing \`${slash}\`. This could take a while...`, response_type: 'in_channel' })
}

module.exports = { worker, listener }
