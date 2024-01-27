const { getProfile } = require('../middleware/getProfile')
const { Op, Transaction, Error } = require('sequelize')
const { sequelize } = require('../model')
const { Router } = require('express')

const router = Router()
router.get('/unpaid', async (req, res) => {
    const { Contract, Job } = req.app.get('models')
    try {
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
    } catch (e) {
        console.error(e)
        res.status('code' in e ? e.code : 500).json({
            errors: ['code' in e ? e.message : 'Internal Server Error.'],
        })
    }
})

router.post('/:id/pay', async (req, res) => {
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

module.exports = router
