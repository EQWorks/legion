const axios = require('axios')
const { WebClient } = require('@slack/web-api')
const { lambda, getFuncName } = require('./util')


const DEV_CHANNEL_ID = 'G1FDULP1R'
const { SLACK_OAUTH, DEPLOYED } = process.env
const web = new WebClient(SLACK_OAUTH)

const R = /(?<cat>\S+?)(\/(?<t2>\S+))?(:| - )(?<update>.*)/
const parseSubject = (s) => {
  const matches = s.match(R)
  // unmatched to generic "others" category
  if (!matches) {
    return ['others', undefined, s.replace(/^\W*\s*/, '')]
  }
  // with T2
  const { groups: { cat, t2, update } } = matches
  const subCat = t2 && t2.toLowerCase()
  return [cat.toLowerCase(), subCat, update]
}

const worker = async ({ channel, response_url, ts }) => {
  const { messages: thread } = await web.conversations.replies({ channel, ts })
  // filter updates from any other messages that could be conversation
  const updates = thread.filter(({ text }) => {
    // get the first word of the block of text and check if it is an action
    const { action } = text.match(/(?<action>[^/-]\S+)/).groups
    return action.toLowerCase().match(/did|doing|issues|todo/)
  })
  const o = {}
  updates.forEach(({ text, user }) => {
    const isActionDid = []
    const isActionDoing = []
    const isActionIssues = []
    const _input = text.split('\n')
    _input.forEach((line, i) => {
      if (line.toLowerCase().match(/^did/)) isActionDid.push(i)
      if (line.toLowerCase().match(/^doing/)) isActionDoing.push(i)
      if (line.toLowerCase().match(/^issue/)) isActionIssues.push(i)
    })
    const did = isActionDid.length ? _input.slice(isActionDid[0], isActionDoing[0]) : []
    const doing = isActionDoing.length && _input.slice(isActionDoing[0], isActionIssues[0])
    const issues = isActionIssues.length && _input.slice(isActionIssues[0])

    did.forEach((input) => {
      if (input.toLowerCase().match(/^did/)) return
      const [cat, subCat, update] = parseSubject(input)
      const _subCat = subCat || 'others'
      const _update = `${update} (<@${user}>)`

      if (o[cat]) {
        if(o[cat][_subCat]){
          o[cat][_subCat] = [...o[cat][_subCat], _update]
        } else {
          o[cat][_subCat] = [ _update]
        }
      } else {
        o[cat] = {[_subCat]: [_update]}
      }
    })
  })
  let response = ''
  Object.entries(o).forEach(([project, details]) => {
    response += `\n\n ${project.toUpperCase()} \n`
    Object.entries(details).forEach(([subProject, content]) => {
      if (subProject !== 'others') response += `*_${subProject}_* \n`
      content.forEach((update) => (response += `• ${update} \n`))
    })
  })

  /** updates = [
   {
    client_msg_id: '9e0d7786-423e-488b-8653-811f30c3dff9',
    type: 'message',
    text: 'Did:\n' +
      '• FO/ML: new `/views` routes\n' +
      '• FO/ML: expose content field\n' +
      '• ML Writer: add validation for json fields\n' +
      '• Atom/Onlia: split auto &amp; home conversions\n' +
      '• Sales/Bell: translate deck into French\n' +
      '• HH: calculate coverage metrics\n' +
      'Doing:\n' +
      '• ML: look into caching query results',
    user: 'UU489FGKH',
    ts: '1603810241.117100',
    team: 'T1FDR4NG3',
    blocks: [ [Object] ],
    thread_ts: '1603807314.106800'
  },
  ...]
   */

  /** updates[0].blocks = [
    {
      type: 'rich_text',
      block_id: '2kxf',
      elements: [ [Object], [Object], [Object], [Object] ]
    }
  ] */

  /** updates[0].blocks[0].elements = [
    { type: 'rich_text_section', elements: [ [Object] ] },
    {
      type: 'rich_text_list',
      elements: [
        [Object], [Object],
        [Object], [Object],
        [Object], [Object],
        [Object], [Object],
        [Object]
      ],
      style: 'bullet',
      indent: 0
    },
    { type: 'rich_text_section', elements: [ [Object] ] },
    {
      type: 'rich_text_list',
      elements: [ [Object] ],
      style: 'bullet',
      indent: 0
    }
  ]*/

  //---------------------
  // const o = {}
  // updates.forEach(u => console.log(u.blocks))
  // updates.forEach(({
  //   text,
  //   blocks: [{ elements: [did, did_input, doing, doing_input] }], //can be more than 4?
  //   user
  // }) => {
  //   did_input.elements.forEach(({ elements: [{ text: input }] }) => {
  //     //[{
  //     //     type: 'text',
  //     //     text: 'snoke/marketplace:  url blocks for marketplace - only dev has access'
  //     // }]
  //     const [t1, t2, message] = parseSubject(input) // what about when no t2?
  //     console.log(t1, t2, message)
  //     // if (o[t1]) {
  //     //   o[t1] = {...o[t1], [t2]: `${message} by (<@${user}>)` }
  //     // } else {
  //     //   o[t1] = {}
  //     // }
  //   })

  // })
  //---------------------
  return axios.post(response_url, {
    response_type: 'ephemeral',
    text:response
  })

}

const route = (req, res) => {
  const { text, response_url } = req.body

  // text = <https://eqworks.slack.com/archives/G1FDULP1R/p1603807314106800>
  const r = /<https:\/\/eqworks.slack.com\/archives\/(?<channel>.*)\/p(?<timestamp>.*)>/
  const { groups: { channel, timestamp } } = text.match(r)
  if (channel !== DEV_CHANNEL_ID) {
    return axios.post(response_url, {
      response_type: 'ephemeral',
      blocks: [
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Please provide the correct meeting notes link, from the #dev channel',
          },
        },
      ],
    })
  }
  const ts = (Number(timestamp) / 1000000).toFixed(6)

  const payload = { response_url, ts, channel }

  // if (DEPLOYED) {
  //   lambda.invoke({
  //     FunctionName: getFuncName('slack'),
  //     InvocationType: 'Event',
  //     Payload: JSON.stringify({ type: 'notes', payload }),
  //   }, (err) => {
  //     if (err) {
  //       console.error(err)
  //       return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to compile' })
  //     }
  //     return res.status(200).json({ response_type: 'ephemeral', text: 'Compiling...' })
  //   })
  // } else {
  worker(payload).catch(error => console.log('error >>>', error))
  // worker(payload).catch(console.error)
  return res.status(200).json({ response_type: 'ephemeral', text: 'Compiling...' })
  // }
}

module.exports = { worker, route }