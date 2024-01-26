const express = require('express')
const bodyParser = require('body-parser')
const { sequelize } = require('./model')
const { getProfile } = require('./middleware/getProfile')
const { Op } = require('sequelize')
const app = express()
app.use(bodyParser.json())
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

app.get('/contracts/:id', getProfile, async (req, res) => {
    const { Contract } = req.app.get('models')
    const { id } = req.params
    const contract = await Contract.findOne({
        where: {
            id,
            [Op.or]: [
                { ContractorId: req.profile.id },
                { ClientId: req.profile.id },
            ],
        },
    })
    if (!contract) return res.status(404).end()
    res.json(contract)
})

app.get('/contracts', getProfile, async (req, res) => {
    const { Contract } = req.app.get('models')
    const contracts = await Contract.findAll({
        where: {
            status: {
                [Op.ne]: 'terminated',
            },
            [Op.or]: [
                { ContractorId: req.profile.id },
                { ClientId: req.profile.id },
            ],
        },
    })
    if (contracts.length === 0) return res.sendStatus(404)
    res.json(contracts)
})

app.get('/jobs/unpaid', getProfile, async (req, res) => {
    const { Contract, Job } = req.app.get('models')
    const jobs = await Job.findAll({
        include: [
            {
                model: Contract,
                where: {
                    [Op.or]: [
                        { ContractorId: req.profile.id },
                        { ClientId: req.profile.id },
                    ],
                    status: 'in_progress',
                },
                attributes: [],
            },
        ],
        where: {
            paid: {
                [Op.is]: null,
            },
        },
    })
    if (jobs.length === 0) return res.sendStatus(404)
    res.json(jobs)
})

module.exports = app
