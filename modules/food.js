// https://api.yelp.com/v3/businesses/search?term=noodle&location=eq works&radius=500
const express = require('express')
const axios = require('axios')
const sampleSize = require('lodash.samplesize')

const { verifySlack } = require('./middleware')

const { YELP_API_KEY } = process.env

const router = express.Router()


router.all('/', verifySlack, (req, res, next) => {
  const { text } = req.body
  const [term, location = 'EQ Works', radius = 1000, max = 3] = (text || 'lunch').split(',').map(p => p.trim())

  if (term === '') {
    return res.json({ text: '`term` cannot be empty', mrkdwn: true })
  }

  axios.get('/businesses/search', {
    baseURL: 'https://api.yelp.com/v3',
    headers: { Authorization: `Bearer ${YELP_API_KEY}` },
    params: { term, location, radius, open_now: true },
  }).then(({ data: { businesses, total } }) => {
    if (!total) {
      return res.status(404).json({
        response_type: 'in_channel',
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
    return res.status(200).json({
      response_type: 'in_channel',
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
  }).catch(next)
})


module.exports = router
