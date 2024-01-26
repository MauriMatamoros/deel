const express = require('express')
const bodyParser = require('body-parser')
const { Op, Transaction, QueryTypes, Error } = require('sequelize')
const { query, validationResult, body } = require('express-validator')

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
                            ClientId: req.profile.id,
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
        res.status('code' in e ? e.code : 500).json({
            errors: ['code' in e ? e.message : 'Internal Server Error.'],
        })
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

        try {
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
                {
                    replacements: { startDate, endDate },
                    type: QueryTypes.SELECT,
                }
            )

            res.send(row)
        } catch (e) {
            console.error(e)
            res.status('code' in e ? e.code : 500).json({
                errors: ['code' in e ? e.message : 'Internal Server Error.'],
            })
        }
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

        try {
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
        } catch (e) {
            console.error(e)
            res.status('code' in e ? e.code : 500).json({
                errors: ['code' in e ? e.message : 'Internal Server Error.'],
            })
        }
    }
)

app.post(
    '/balances/deposit/:userId',
    getProfile,
    [
        body('deposit')
            .isNumeric()
            .withMessage('Must be a number.')
            .custom((value) => {
                if (value > 0) {
                    return true
                }
                throw new Error('Must be a positive number')
            }),
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() })
        }
        const { deposit } = req.body
        const { userId } = req.params
        const { Profile } = req.app.get('models')
        const transaction = await sequelize.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
        })
        try {
            const user = await Profile.findOne(
                { where: { id: req.profile.id }, lock: true },
                { transaction }
            )
            const [row] = await sequelize.query(
                `
                SELECT sum(price) * .25 AS "maxDepositAllowed"
                FROM Jobs
                JOIN Contracts
                ON Jobs.ContractId = Contracts.id
                WHERE status <> 'terminated' 
                AND paid IS NULL 
                AND ClientId = :id;`,
                {
                    replacements: { id: req.profile.id },
                    type: QueryTypes.SELECT,
                    transaction,
                }
            )

            const { maxDepositAllowed } = row

            if (maxDepositAllowed && deposit > maxDepositAllowed) {
                const error = new Error('Deposit exceeds allowed amount.')
                error.code = 422
                throw error
            }

            if (deposit > req.profile.balance) {
                const error = new Error('Deposit exceeds balance.')
                error.code = 422
                throw error
            }

            if (parseInt(userId) === req.profile.id) {
                await user.increment('balance', { by: deposit, transaction })
            } else {
                const receiver = await Profile.findOne(
                    { where: { id: userId }, lock: true },
                    { transaction }
                )

                if (!receiver) {
                    const error = new Error('Receiver Profile not found.')
                    error.code = 404
                    throw error
                }

                await user.decrement('balance', { by: deposit, transaction })

                await receiver.increment('balance', {
                    by: deposit,
                    transaction,
                })
            }

            await transaction.commit()

            const updatedUser = await Profile.findOne({
                where: { id: req.profile.id },
            })

            res.send(updatedUser)
        } catch (e) {
            await transaction.rollback()
            console.error(e)
            res.status('code' in e ? e.code : 500).json({
                errors: ['code' in e ? e.message : 'Internal Server Error.'],
            })
        }
    }
)

module.exports = app
