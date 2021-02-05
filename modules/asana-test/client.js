const axios = require('axios')
const qs = require('querystring')


const { client_id, client_secret } = process.env

module.exports.tokenExchange = ({ code, grant_type = 'authorization_code' }) => {
  return axios.post(
    'https://app.asana.com/-/oauth_token',
    qs.stringify({
      code,
      grant_type,
      client_id,
      client_secret,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  )
    .then(({ data = {} }) => data)
    .catch((e) => console.error(`Failed to fetch asana access token: ${e}`))
}

module.exports.getAuthorizeUrl = () => {
  const url = [
    'https://app.asana.com/-/oauth_authorize',
    `?client_id=${client_id}`,
    '&redirect_uri=urn:ietf:wg:oauth:2.0:oob',
    '&response_type=code',
  ].join('')
  return url
}
