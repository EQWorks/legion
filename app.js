const express = require('express')
const serverless = require('serverless-http')
const bodyParser = require('body-parser')

const maintenance = './modules/maintenance'
const deploy = './modules/deploy'
const report = './modules/report'


const app = express()

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.get('/', (req, res) => {
  return res.send('We Are Legion')
})

// secondary prefix for backward compat
app.use(['/report', '/'], report)

app.use('/maintenance', maintenance)

app.use('/deploy', deploy)


if (require.main === module) {
  const PORT = process.env.PORT || 8000
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Listening on port ${PORT}`)
  })
} else {
  module.exports.handler = serverless(app)
}
