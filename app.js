const { App, AwsLambdaReceiver } = require('@slack/bolt')

const { commands } = require('./modules')

// https://slack.dev/bolt-js/deployments/aws-lambda
const receiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
})

const app = new App({
  token: process.env.SLACK_OAUTH,
  receiver,
  socketMode: false,
})

Object.entries(commands).forEach(([name, { listener, viewHandler }]) => {
  /* sample command object given to listener({ command, ack, ... })
    {
      token: 'm4Q8xY7jIYRbwM0W7u7utV30',
      team_id: 'T1FDR4NG3',
      team_domain: 'eqworks',
      channel_id: 'CCCB6QD9S',
      channel_name: 'bot-cmd', // <- this eliminates the need for getChannelName
      user_id: 'U1FF6KSF9',
      user_name: 'woozyking',
      command: '/diff',
      text: 'snoke',
      api_app_id: 'A6HPM5VC0',
      is_enterprise_install: 'false',
      response_url: 'https://hooks.slack.com/commands/T1FDR4NG3/2956432472786/J8Q17JPFukiLurI8zbVJzTCX',
      trigger_id: '2956462218819.49467158547.0dae80ec6d595b045efcf7a8fee079e7'
    }
  */
  app.command(`/${name}`, listener)

  // interactive views, by callback_id
  if (viewHandler) {
    app.view(name,  viewHandler)
  }
})

module.exports.handler = async(...params) => {
  const handler = await receiver.start()
  return handler(...params)
}
