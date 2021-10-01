const { WebClient } = require('@slack/web-api')
const AWS = require('aws-sdk')

const { SLACK_OAUTH, STAGE = 'dev' } = process.env

const web = new WebClient(SLACK_OAUTH)

// to get group id, can run this.listUserGroups() with await or promises and look at 'id' key
const SLACK_GROUP_IDS = {
  'snoketeam': 'SA4K92V8F',
  'firstorderteam': 'SA3HUB0QJ',
  'overlordteam': 'S1FG0BA3C',
  'overseerteam': 'S7KPS7K7S',
  'flashteam': 'S1FFKS7FS',
}

module.exports.lambda = new AWS.Lambda({
  apiVersion: '2015-03-31',
  region: 'us-east-1',
})

module.exports.getFuncName = f => `legion-${STAGE}-${f}`
module.exports.invokeSlackWorker = (Payload) => this.lambda.invoke({
  FunctionName: this.getFuncName('slack'),
  InvocationType: 'Event',
  Payload: JSON.stringify(Payload),
}).promise()

module.exports.datapipeline = new AWS.DataPipeline({ region: 'us-east-1' })

module.exports.listUserGroups = () => web.usergroups.list({
  include_users: true,
  include_disabled: false,
})
module.exports.getGroupUsers = (groups) => this.listUserGroups()
  .then(({ usergroups }) => usergroups.filter(({ id }) => groups.includes(id)))
  .then((g) => g.map(({ users }) => users).flat())
  .then((u) => Array.from(new Set(u)))
module.exports.userInGroup = ({ user_id, groups }) => this.getGroupUsers(groups).then(u => u.includes(user_id))

module.exports.errMsg = (err) => `\`\`\`${err.toString()}\`\`\``

module.exports.getSpecificGroupIds = (groups) => Object.entries(SLACK_GROUP_IDS)
  .filter(i => groups.includes(i[0]))
  .map(i => i[1])

module.exports.getChannelName = async ({ channel_name, channel_id }) => {
  let cn = channel_name
  if (channel_name === 'privategroup') {
    const { channel: { name } = {} } = await web.conversations.info({ channel: channel_id })
    cn = name
  }
  return cn
}
