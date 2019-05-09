const SLACK_VERIFY_TOKEN = process.env.SLACK_VERIFY_TOKEN || ''


const verifySlack = (req, res, next) => {
  const token = req.body.token
  if (SLACK_VERIFY_TOKEN && (token === SLACK_VERIFY_TOKEN)) {
    return next()
  }
  return res.status(403).json({
    text: 'Cartman, is that you?'
  })
}


module.exports = { verifySlack }
