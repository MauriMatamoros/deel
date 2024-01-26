const express = require('express')
const bodyParser = require('body-parser')
const { Op, Transaction, QueryTypes, Error } = require('sequelize')
const { query, validationResult, body } = require('express-validator')

const { sequelize } = require('./model')

const app = express()

app.use(bodyParser.json())
app.set('sequelize', sequelize)
app.set('models', sequelize.models)
app.use('/admin', require('./routes/admin'))
app.use('/balances', require('./routes/balances'))
app.use('/contracts', require('./routes/contracts'))
app.use('/jobs', require('./routes/jobs'))

module.exports = app
