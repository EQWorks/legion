const axios = require('axios')
const { WebClient } = require('@slack/web-api')
const { lambda, getFuncName } = require('./util')


const DEV_CHANNEL_ID = 'G1FDULP1R'
const { SLACK_OAUTH, DEPLOYED } = process.env
const web = new WebClient(SLACK_OAUTH)

const R = /(?<cat>\S+?)(\/(?<t2>\S+))?( - |: )(?<update>.*)/
const parseSubject = (s) => {
  const matches = s.match(R)
  // unmatched to generic "others" category
  if (!matches) {
    return ['others', 'others', s]
  }
  // with tier 2 for subcategory
  const { groups: { cat, t2, update } } = matches
  const subCat = t2 ? t2.toLowerCase() : 'others'
  return [cat.toLowerCase(), subCat, update]
}

const worker = async ({ channel, response_url, ts, text }) => {
  if (text === 'template') {
    const getBlock = (text) => (
      {
        type: 'rich_text',
        elements: [
          {
            type: 'rich_text_section',
            elements: [
              { type: 'text', text }]
          },
          {
            type: 'rich_text_list',
            elements: [{
              type: 'rich_text_section',
              elements: [{ type: 'text', text: text.includes('Common') ? 'react-labs/chip - improved style and color' : ' ' }]
            }],
            style: 'bullet',
            indent: 0
          },
        ]
      }
    )
    const blocks = ['Common', 'Atom', 'Locus', 'Automation', 'Data'].map((project) => (
      getBlock(`Did - ${project}`)
    ))
    blocks.push(getBlock('Doing'))
    blocks.push(getBlock('Questions'))

    return axios.post(response_url, {
      response_type: 'ephemeral',
      blocks
    })
  }

  if (channel !== DEV_CHANNEL_ID) {
    return axios.post(response_url, {
      response_type: 'ephemeral',
      blocks: [
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':x:  Please provide the correct meeting notes link, from the #dev channel',
          },
        },
      ],
    })
  }

  const { messages: thread } = await web.conversations.replies({ channel, ts })
  // filter out any other message that could be conversation including parent note
  const updates = thread.filter(({ text }) => {
      // get the first word of the block of text and check if it is an action
      const match = text.match(/(?<action>[^/-]\S+)/)

      // TODO: extract info when hugo is used to add updates as match is null, temp fix
      if (match) {
        const { action } = match.groups
        return action.toLowerCase().match(/did|doing|issues|todo/)
      }
  })
  /** updates = [
 {
  client_msg_id: '9e0d7786-423e-488b-8653-811f30c3dff9',
  type: 'message',
  text: 'Did - Locus:\n' +
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

  const categorizedData = {}
  let project = ''
  updates.forEach(({ text, user }) => {
    const isActionDid = []
    const isActionDoing = []
    const isActionQuestions = []
    const _input = text.split('\n')
    _input.forEach((line, i) => {
      if (line.toLowerCase().match(/^did/)) isActionDid.push(i)
      if (line.toLowerCase().match(/^doing/)) isActionDoing.push(i)
      if (line.toLowerCase().match(/^question/)) isActionQuestions.push(i)
    })
    const did = isActionDid.length ? _input.slice(isActionDid[0], isActionDoing[0]) : []
    // const doing = isActionDoing.length && _input.slice(isActionDoing[0], isActionQuestions[0])
    const questions = isActionQuestions.length ? _input.slice(isActionQuestions[0]) : []

    const categorize = (input) => {
      const [repo, subCat, _update] = parseSubject(input.replace(/^\W*\s*/, ''))
      const update = `${_update} (<@${user}>)`

      if (categorizedData[project][repo]) {
        if (categorizedData[project][repo][subCat]) {
          categorizedData[project][repo][subCat].push(update)
        } else {
          categorizedData[project][repo][subCat] = [update]
        }
      } else {
        categorizedData[project][repo] = { [subCat]: [update] }
      }
    }

    did.forEach((input) => {
      // 'Did - Locus:'
      if (input.toLowerCase().match(/^did/)) {
        const { groups: { main_project } } = input.match(/(?<action>\w+)(\W*)(?<main_project>[A-Za-z]*)?/) || {}
        project = main_project ? main_project.toLowerCase() : 'others'
        categorizedData[project] = { ...categorizedData[project] }
        // categorizedData: { locus: {}}
        return
      }
      categorize(input)
    })

    questions.forEach((input) => {
      if (input.toLowerCase().match(/^question/)) {
        project = 'questions'
        categorizedData[project] = { ...categorizedData[project] }
        return
      }
      categorize(input)
    })
    /**
     categorizedData = {
      common: {
        release: { others: [Array], nlp: [Array] },
        avail: { others: [Array] }
      },
      locus: {
        snoke: { builder: [Array], devops: [Array] },
        hub: { others: [Array] },
        firstorder: { builder: [Array] }
      },
      data: { data: { gam: [Array], others: [Array] } }
    }
     */
  })
  const _questions = categorizedData.questions
  delete categorizedData.questions
  let response = ''
  Object.entries(categorizedData).forEach(([project, details]) => {
    // to account for updates with no project name like 'Did' instead of 'Did - locus'
    if (project !== 'others') response += `\n\n\n${project.toUpperCase()}\n`
    Object.entries(details).forEach(([repo, updates]) => {
      response += `\n\n*_${repo}_*\n`
      Object.entries(updates).forEach(([subCat, content]) => {
        if (subCat === 'others') {
          content.forEach((input) => (response += `\t• ${input}\n`))
        } else {
          response += `\t*_${subCat}_* \n`
          content.forEach((input) => (response += `\t\t• ${input}\n`))
        }
      })
    })
  })

  if (_questions) {
    response += '\n\n\nQUESTIONS\n'
    Object.entries(_questions).forEach(([repo, updates]) => {
      response += repo === 'others' ? '' : `\n*_${repo}_*\n`
      Object.entries(updates).forEach(([subCat, content]) => {
        if (subCat === 'others') {
          content.forEach((input) => (response += `\t• ${input}\n`))
        } else {
          response += `\t*_${subCat}_*\n`
          content.forEach((input) => (response += `\t\t• ${input}\n`))
        }
      })
    })

  }

  return axios.post(response_url, {
    response_type: 'ephemeral',
    text: response,
  })

}

const route = (req, res) => {
  const { text, response_url } = req.body
  const input = { text }
  if (text !== 'template') {
    // text = <https://eqworks.slack.com/archives/G1FDULP1R/p1603807314106800>
    const r = /<https:\/\/eqworks.slack.com\/archives\/(?<channel>.*)\/p(?<timestamp>.*)>/
    const { groups: { channel, timestamp } } = text.match(r)
    const ts = (Number(timestamp) / 1000000).toFixed(6)
    delete input.text
    input.channel = channel
    input.ts = ts
  }
  const payload = { response_url, ...input }

  if (DEPLOYED) {
    lambda.invoke({
      FunctionName: getFuncName('slack'),
      InvocationType: 'Event',
      Payload: JSON.stringify({ type: 'notes', payload }),
    }, (err) => {
      if (err) {
        console.error(err)
        return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to compile' })
      }
      return res.status(200).json({ response_type: 'ephemeral', text: 'Compiling...' })
    })
  } else {
    worker(payload).catch(console.error)
    return res.status(200).json({ response_type: 'ephemeral', text: 'Compiling...' })
  }
}

module.exports = { worker, route }
