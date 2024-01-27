const getStatusCode = (e) => ('code' in e ? e.code : 500)

const buildErrorPayload = (e) => ({
    errors: ['code' in e ? e.message : 'Internal Server Error.'],
})

module.exports = { getStatusCode, buildErrorPayload }
