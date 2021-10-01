const crypto = require('crypto')
const timingSafeCompare = require('tsscmp')

const { SLACK_SIGNING_SECRET = '' } = process.env


const _verify = ({
  headers: { 'x-slack-signature': signature, 'x-slack-request-timestamp': timestamp },
  rawBody,
}) => {
  const hmac = crypto.createHmac('sha256', SLACK_SIGNING_SECRET)
  const [version, hash] = signature.split('=')

  // Check if the timestamp is too old
  const fiveMinutesAgo = parseInt(Date.now() / 1000) - (60 * 5)
  if (timestamp < fiveMinutesAgo) {
    return false
  }

  hmac.update(`${version}:${timestamp}:${rawBody}`)

  // check that the request signature matches expected value
  return timingSafeCompare(hmac.digest('hex'), hash)
}


const verifySlack = (req, res, next) => {
  if (_verify(req)) {
    return next()
  }
  return res.status(403).json({
    text: 'Cartman, is that you?'
  })
}


module.exports = { verifySlack }
