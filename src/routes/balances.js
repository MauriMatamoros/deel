const { body, validationResult } = require('express-validator')
const { Error, Transaction, QueryTypes } = require('sequelize')
const { sequelize } = require('../model')
const { Router } = require('express')
const { getMaxDepositAllowed } = require('../db/queries')
const { getStatusCode, buildErrorPayload } = require('../utils/handleErrors')
const validateNumberIsPositive = require('../utils/validateNumberIsPositive')

const router = Router()
router.post(
    '/deposit/:userId',
    [
        body('deposit')
            .isNumeric()
            .withMessage('Must be a number.')
            .custom(validateNumberIsPositive),
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
            const [row] = await sequelize.query(getMaxDepositAllowed, {
                replacements: { id: req.profile.id },
                type: QueryTypes.SELECT,
                transaction,
            })

            const { maxDepositAllowed } = row

            if (maxDepositAllowed && deposit > maxDepositAllowed) {
                const error = new Error('Deposit exceeds allowed amount.')
                error.code = 422
                throw error
            }

            if (maxDepositAllowed && deposit > req.profile.balance) {
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
            res.status(getStatusCode(e)).json(buildErrorPayload(e))
        }
    }
)

module.exports = router
