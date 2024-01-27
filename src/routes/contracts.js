const { Op } = require('sequelize')
const { Router } = require('express')
const { getStatusCode, buildErrorPayload } = require('../utils/handleErrors')

const router = Router()
router.get('/:id', async (req, res) => {
    const { Contract } = req.app.get('models')
    const { id } = req.params
    try {
        const contract = await Contract.findOne({
            where: {
                id,
                [Op.or]: [
                    { ContractorId: req.profile.id },
                    { ClientId: req.profile.id },
                ],
            },
        })
        if (!contract) {
            const error = new Error('Contract not found.')
            error.code = 404
            throw error
        }
        res.json(contract)
    } catch (e) {
        console.error(e)
        res.status('code' in e ? e.code : 500).json({
            errors: ['code' in e ? e.message : 'Internal Server Error.'],
        })
    }
})

router.get('/', async (req, res) => {
    const { Contract } = req.app.get('models')
    try {
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
    } catch (e) {
        console.error(e)
        res.status(getStatusCode(e)).json(buildErrorPayload(e))
    }
})

module.exports = router
