// https://api.yelp.com/v3/businesses/search?term=noodle&location=eq works&radius=500
const axios = require('axios')
const sampleSize = require('lodash.samplesize')

const { lambda, getFuncName  } = require('./util')

const { YELP_API_KEY, DEPLOYED = false } = process.env


const worker = async ({ response_url, ...params }) => {
  const { data: { businesses, total } } = await axios.get('/businesses/search', {
    baseURL: 'https://api.yelp.com/v3',
    headers: { Authorization: `Bearer ${YELP_API_KEY}` },
    params,
  })

  if (!total) {
    return axios.post(response_url, {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `No restaurants within ${radius}m around ${location} were found using the term: *${term}*`,
          }
        },
      ],
    })
  }
  const { max, radius, location, term } = params
  const info = sampleSize(businesses, max).map((b) => ([
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*<${b.url}|${b.name}>*`,
          `${b.location.display_address.join(' ')}\n`,
          `Rating: ${b.rating} on Yelp`,
          `Price: ${b.price}`,
        ].join('\n'),
      },
      accessory: {
        type: 'image',
        image_url: b.image_url,
        alt_text: 'venue image'
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'image',
          image_url: 'https://cdn.glitch.com/203fa7da-fadf-4c32-8d75-fb80800ef1b5%2Fyelp_logo_sm.png?1550364622921',
          alt_text: 'Yelp logo',
        },
        {
          'type': 'plain_text',
          'text': `${b.review_count} reviews`,
          'emoji': true,
        },
      ],
    },
    { type: 'divider' },
  ]))
  return axios.post(response_url, {
    response_type: 'in_channel',
    replace_original: true,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`${max}/${total}\` restaurants within ${radius}m around ${location} were sampled using the term: *${term}*`,
        },
      },
      { type: 'divider' },
      // TODO: Array.prototype.flat not avail in Node until v11+
      ...[].concat.apply([], info),
    ],
  })
}

const route = (req, res) => {
  const { text, response_url } = req.body

  const [
    term,
    location = 'EQ Works',
    radius = 1000,
    max = 3,
    open_now = true,
  ] = (text || 'lunch').split(',').map(p => p.trim())

  if (term === '') {
    return res.status(200).json({ text: '`term` cannot be empty', mrkdwn: true })
  }

  const payload = { term, location, radius, max, open_now, response_url }

  if (DEPLOYED) {
    lambda.invoke({
      FunctionName: getFuncName('food'),
      InvocationType: 'Event',
      Payload: JSON.stringify(payload),
    }, (err) => {
      if (err) {
        console.error(err)
        return res.status(200).json({ response_type: 'ephemeral', text: 'Failed to search' })
      }
      return res.status(200).json({ response_type: 'ephemeral', text: 'Searching for food...' })
    })
  } else {
    worker(payload).catch(console.error)
    return res.status(200).json({ response_type: 'ephemeral', text: 'Searching for food...' })
  }
}

module.exports = { worker, route }
