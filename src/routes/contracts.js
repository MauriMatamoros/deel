const { getProfile } = require('../middleware/getProfile')
const { Op } = require('sequelize')
const { Router } = require('express')

const router = Router()
router.get('/:id', getProfile, async (req, res) => {
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

router.get('/', getProfile, async (req, res) => {
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

module.exports = router
