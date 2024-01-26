const express = require('express')
const bodyParser = require('body-parser')
const { Op, Transaction, QueryTypes } = require('sequelize')
const { query, validationResult } = require('express-validator')

const { sequelize } = require('./model')
const { getProfile } = require('./middleware/getProfile')

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
        res.sendStatus('code' in e ? e.code : 500)
    }
})

app.get(
    '/admin/best-profession',
    getProfile,
    [
        query('start')
            .isISO8601()
            .toDate()
            .withMessage('start must be a valid date'),
        query('end')
            .isISO8601()
            .toDate()
            .withMessage('end must be a valid date'),
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }
        const { start, end } = req.query

        const startDate = new Date(start).toISOString().slice(0, 10)
        const endDate = new Date(end).toISOString().slice(0, 10)

        const [row] = await sequelize.query(
            `
            WITH jobs_with_contracts AS (
                SELECT *
                FROM Jobs
                JOIN Contracts
                ON Jobs.ContractId = Contracts.id
            )

            SELECT profession, SUM(jobs_with_contracts.price) AS total_earnings
            FROM Profiles
            JOIN jobs_with_contracts ON ContractorId = Profiles.id
            WHERE jobs_with_contracts.paid = 1
            AND jobs_with_contracts.paymentDate BETWEEN :startDate AND DATE(:endDate, '+1 day')
            GROUP BY profession
            ORDER BY total_earnings DESC
            LIMIT 1;
        `,
            { replacements: { startDate, endDate }, type: QueryTypes.SELECT }
        )

        res.send(row)
    }
)

app.get(
    '/admin/best-clients',
    getProfile,
    [
        query('start')
            .isISO8601()
            .toDate()
            .withMessage('start must be a valid date'),
        query('end')
            .isISO8601()
            .toDate()
            .withMessage('end must be a valid date'),
        query('limit').optional().isNumeric(),
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }
        const { start, end } = req.query
        const limit = req.query.limit || 2

        const startDate = new Date(start).toISOString().slice(0, 10)
        const endDate = new Date(end).toISOString().slice(0, 10)

        const rows = await sequelize.query(
            `
                WITH jobs_with_contracts AS (
                    SELECT *
                    FROM Jobs
                    JOIN Contracts
                    ON Jobs.ContractId = Contracts.id
                )

                SELECT Profiles.id, firstName || ' ' || lastName AS fullName, jobs_with_contracts.price
                FROM Profiles
                JOIN jobs_with_contracts ON ClientId = Profiles.id
                WHERE jobs_with_contracts.paid = 1
                AND jobs_with_contracts.paymentDate BETWEEN :startDate AND DATE(:endDate, '+1 day')
                GROUP BY Profiles.id
                ORDER BY price DESC
                LIMIT :limit;
            `,
            {
                replacements: { startDate, endDate, limit },
                type: QueryTypes.SELECT,
            }
        )

        res.send(rows)
    }
)

module.exports = app
