const express = require('express')
const bodyParser = require('body-parser')
const { sequelize } = require('./model')
const { getProfile } = require('./middleware/getProfile')
const { Op, Transaction } = require('sequelize')
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
    res.json(jobs)
})

app.post('/jobs/:id/pay', getProfile, async (req, res) => {
    const { id } = req.params
    const { Contract, Job, Profile } = req.app.get('models')
    const transaction = await sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
    })
    try {
        const job = await Job.findOne(
            {
                include: [
                    {
                        model: Contract,
                        where: {
                            [Op.or]: [{ ClientId: req.profile.id }],
                            status: 'in_progress',
                        },
                    },
                ],
                where: {
                    id,
                    paid: {
                        [Op.is]: null,
                    },
                },
                lock: true,
            },
            { transaction }
        )

        if (!job) {
            const error = new Error('Job not found.')
            error.code = 404
            throw error
        }

        const client = await Profile.findOne(
            {
                where: {
                    id: job.Contract.ClientId,
                },
                lock: true,
            },
            { transaction }
        )

        if (!client) {
            const error = new Error('Client Profile not found.')
            error.code = 404
            throw error
        }

        if (client.balance < job.price) {
            const error = new Error('Insufficient funds.')
            error.code = 422
            throw error
        }

        const contractor = await Profile.findOne(
            {
                where: {
                    id: job.Contract.ContractorId,
                },
                lock: true,
            },
            { transaction }
        )

        if (!contractor) {
            const error = new Error('Contractor Profile not found.')
            error.code = 404
            throw error
        }

        await client.decrement('balance', { by: job.price, transaction })

        await contractor.increment('balance', { by: job.price, transaction })

        await job
            .set({ paid: 1, paymentDate: new Date() })
            .save({ transaction })

        const plainJob = job.get({ plain: true })
        delete plainJob.Contract

        await transaction.commit()
        res.send(plainJob)
    } catch (e) {
        await transaction.rollback()
        console.error(e)
        return res.sendStatus('code' in e ? e.code : 500)
    }
})

module.exports = app
