package spintracker.data

import org.jetbrains.exposed.dao.*
import org.jetbrains.exposed.dao.id.EntityID
import org.jetbrains.exposed.dao.id.IdTable

class PlayerDao(id: EntityID<Long>) : LongEntity(id) {
    companion object : LongEntityClass<PlayerDao>(Players)

    var name by Players.name
    var room by Players.room
    var isReg by Players.isReg
    var notes by Players.notes
}

class HandDao(id: EntityID<Long>) : LongEntity(id) {
    companion object : LongEntityClass<HandDao>(Hands)

    var handId by Hands.handId
    var gameId by Hands.gameId
    var tblName by Hands.tblName
    var room by Hands.room
    var siteId by Hands.siteId
    var dateTime by Hands.dateTime
    var heroName by Hands.heroName
    var heroPosition by Hands.heroPosition
    var playerCount by Hands.playerCount
    var bigBlind by Hands.bigBlind
    var handRank by Hands.handRank
    var handType by Hands.handType
    var result by Hands.result
    var ev by Hands.ev
    var wentToShowdown by Hands.wentToShowdown
    var rawContent by Hands.rawContent
    var buyIn by Hands.buyIn
    var prizePool by Hands.prizePool
    var multiplier by Hands.multiplier
    var position by Hands.position
    var flop by Hands.flop
    var turn by Hands.turn
    var river by Hands.river
    var totalPot by Hands.totalPot
}

class PlayerHandDao(id: EntityID<Long>) : LongEntity(id) {
    companion object : LongEntityClass<PlayerHandDao>(PlayerHands)

    var handId by PlayerHands.handId
    var playerId by PlayerHands.playerId
    var playerName by PlayerHands.playerName
    var position by PlayerHands.position
    var positionType by PlayerHands.positionType
    var stackSize by PlayerHands.stackSize
    var isHero by PlayerHands.isHero
    var holeCards by PlayerHands.holeCards
    var preflopAction by PlayerHands.preflopAction
    var flopAction by PlayerHands.flopAction
    var turnAction by PlayerHands.turnAction
    var riverAction by PlayerHands.riverAction
    var winnings by PlayerHands.winnings
    var netResult by PlayerHands.netResult
    var netWonAdjusted by PlayerHands.netWonAdjusted
    var place by PlayerHands.place
    var wentToShowdown by PlayerHands.wentToShowdown
    var flgVpip by PlayerHands.flgVpip
    var flgPfr by PlayerHands.flgPfr
    var flg3bet by PlayerHands.flg3bet
    var flg4bet by PlayerHands.flg4bet
    var flg5bet by PlayerHands.flg5bet
    var flgSqueeze by PlayerHands.flgSqueeze
    var flgLimp by PlayerHands.flgLimp
    var flgCbetFlop by PlayerHands.flgCbetFlop
    var flgDonkFlop by PlayerHands.flgDonkFlop
    var flgFloatFlop by PlayerHands.flgFloatFlop
    var flgCheckRaiseFlop by PlayerHands.flgCheckRaiseFlop
    var flgSawFlop by PlayerHands.flgSawFlop
    var flgCbetTurn by PlayerHands.flgCbetTurn
    var flgDonkTurn by PlayerHands.flgDonkTurn
    var flgFloatTurn by PlayerHands.flgFloatTurn
    var flgCheckRaiseTurn by PlayerHands.flgCheckRaiseTurn
    var flgSawTurn by PlayerHands.flgSawTurn
    var flgCbetRiver by PlayerHands.flgCbetRiver
    var flgDonkRiver by PlayerHands.flgDonkRiver
    var flgCheckRaiseRiver by PlayerHands.flgCheckRaiseRiver
    var flgSawRiver by PlayerHands.flgSawRiver
    var flgAllin by PlayerHands.flgAllin
    var flgFaceAllin by PlayerHands.flgFaceAllin
    var allinAction by PlayerHands.allinAction
    var flgIsAggressor by PlayerHands.flgIsAggressor
    var aggressorPosition by PlayerHands.aggressorPosition
    var bountyWon by PlayerHands.bountyWon
    var equityPercent by PlayerHands.equityPercent
    var expectedWon by PlayerHands.expectedWon
    var icmEquityPercent by PlayerHands.icmEquityPercent
    var showedCards by PlayerHands.showedCards
    var wonAtShowdown by PlayerHands.wonAtShowdown
    var foldedBeforeShowdown by PlayerHands.foldedBeforeShowdown
    var effectiveStackPreflop by PlayerHands.effectiveStackPreflop
    var effectiveStackFlop by PlayerHands.effectiveStackFlop
    var effectiveStackTurn by PlayerHands.effectiveStackTurn
    var effectiveStackRiver by PlayerHands.effectiveStackRiver
    var sprFlop by PlayerHands.sprFlop
    var handGroup by PlayerHands.handGroup
    var isSuited by PlayerHands.isSuited
    var isPair by PlayerHands.isPair
    var flgRaiseFlop by PlayerHands.flgRaiseFlop
    var flgRaiseTurn by PlayerHands.flgRaiseTurn
    var flgRaiseRiver by PlayerHands.flgRaiseRiver
    var flgXcFlop by PlayerHands.flgXcFlop
    var flgXfFlop by PlayerHands.flgXfFlop
    var flgXcTurn by PlayerHands.flgXcTurn
    var flgXfTurn by PlayerHands.flgXfTurn
    var flgXcRiver by PlayerHands.flgXcRiver
    var flgXfRiver by PlayerHands.flgXfRiver
    var amtBetFlop by PlayerHands.amtBetFlop
    var amtBetTurn by PlayerHands.amtBetTurn
    var amtBetRiver by PlayerHands.amtBetRiver
    var sprTurn by PlayerHands.sprTurn
    var sprRiver by PlayerHands.sprRiver
}

class HandHistoryDao(id: EntityID<Long>) : LongEntity(id) {
    companion object : LongEntityClass<HandHistoryDao>(HandHistories)

    var handId by HandHistories.handId
    var history by HandHistories.history
}
