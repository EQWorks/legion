const express = require('express')
const serverless = require('serverless-http')
const bodyParser = require('body-parser')
const axios = require('axios')

const maintenance = require('./modules/maintenance')
const deploy = require('./modules/deploy')
const report = require('./modules/report')
const diff = require('./modules/diff')


const app = express()

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.get('/', (req, res) => {
  axios.get('https://api.github.com/zen').then(({ data }) => res.send(data))
})

// secondary prefix for backward compat
app.use(['/report', '/'], report)

app.use('/maintenance', maintenance)

app.use('/deploy', deploy)

app.use('/diff', diff)

// catch-all error handler
// eslint disable otherwise not able to catch errors
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let { logLevel, statusCode } = err
  const { message } = err
  logLevel = logLevel || 'ERROR'
  statusCode = statusCode || 500
  // app log
  // eslint-disable-next-line no-console
  console.log(`[${logLevel}] - ${statusCode} - ${message}`)
  if (logLevel === 'ERROR') {
    console.error(`[ERROR] ${message}`, err.stack || err)
  }
  // API response
  return res.status(statusCode).json({
    statusCode,
    logLevel,
    message,
  })
})


if (require.main === module) {
  const PORT = process.env.PORT || 8000
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Listening on port ${PORT}`)
  })
} else {
  module.exports.handler = serverless(app)
}
