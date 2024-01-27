const { getProfile } = require('../middleware/getProfile')
const { query, validationResult } = require('express-validator')
const { sequelize } = require('../model')
const { QueryTypes, Error } = require('sequelize')
const { Router } = require('express')
const { getBestClients, getBestProfession } = require('../db/queries')

const router = Router()
router.get(
    '/best-profession',
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
            const [row] = await sequelize.query(getBestProfession, {
                replacements: { startDate, endDate },
                type: QueryTypes.SELECT,
            })

            res.send(row)
        } catch (e) {
            console.error(e)
            res.status('code' in e ? e.code : 500).json({
                errors: ['code' in e ? e.message : 'Internal Server Error.'],
            })
        }
    }
)

router.get(
    '/best-clients',
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
        query('limit')
            .optional()
            .isInt()
            .custom((value) => {
                if (value > 0) {
                    return true
                }
                throw new Error('Must be a positive integer')
            }),
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
            const rows = await sequelize.query(getBestClients, {
                replacements: { startDate, endDate, limit },
                type: QueryTypes.SELECT,
            })

            res.send(rows)
        } catch (e) {
            console.error(e)
            res.status('code' in e ? e.code : 500).json({
                errors: ['code' in e ? e.message : 'Internal Server Error.'],
            })
        }
    }
)

module.exports = router
