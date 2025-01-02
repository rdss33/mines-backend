import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";

//#region Backend setup
const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
//#endregion

const SIZE = 5;// Size of grid, currently a 5x5 square
const DEFAULT_MINES = 8;// Amount of default mines
const DEFAULT_BET = 10;// Default value for bet
const HOUSETAX = 0.01;// % the house takes, reducing probability of winning

let gameInformation;
let playerVolatileInformation;
let successfulHits;
let playerBalance = 100;

function initialize(){
    gameInformation = {
        gameGrid: null,
        mineAmount: DEFAULT_MINES,
        gameState: 0
    }
    playerVolatileInformation = {
        playerProfitMultiplier: 1,
        playerBet: DEFAULT_BET,
        playerProfit: 0
    }
    successfulHits = 0;
}

function randomCell(rowCount,columnCount){
    const row = Math.floor(Math.random()*rowCount);
    const column = Math.floor(Math.random()*columnCount);
    return {
        row: row,
        column: column,
    }
}

function hasMine(minesArray,evaluatingCell){
    return (
        minesArray.filter(cell => // Verifies each cell in the array of cells that contains mines,
            (evaluatingCell.row===cell.row && evaluatingCell.column===cell.column)// if any has both row and column equal to the clicked cell, return true
        ).length > 0
    );
}
function generateGrid(mineCount){
    let minesArray = [];// Initializes a temporary array to hold the mines
    do{
        let mineCell = randomCell(SIZE,SIZE);// Randomizes a cell from row 0 to SIZE and from column 0 to SIZE
        if (!hasMine(minesArray,mineCell))// If it doesn't yet have a mine
        {
            minesArray.push(mineCell);// Add it to the list of cells that have mines
        }
    }while(minesArray.length<mineCount);// Do this loop until we have enough mined cells in the list that it's length is equal to the amount of desired mines
    gameInformation.mineAmount = mineCount;// Update the backend knowledge of how many mines there are, despite whatever happens in the frontend
    return minesArray;// Returns the temp array values
}

const calculateProfitMultiplier = (hits) => {
    if(hits===0) return 0; // A mine hit is a 0, and returns a 0 multiplier
    let accumulatedChance = 1; // Base 100% for future calculations
    for(let i=0; i<hits;i++){// Repeat the calculation for each consecutive hit
        const normalizeToPercentage = 100/((Math.pow(SIZE,2)-gameInformation.mineAmount)-(i)); // Find how many safe cells there are based on the total amount of mines and clicks, normalized to %
        const normalizedDivisor = (Math.pow(SIZE,2)-(i))*normalizeToPercentage;// Find how many cells there are based on total amount minus the amount of clicks, normalized to %
        accumulatedChance *= (100/normalizedDivisor);// Calculate new chance of winning
    }
    console.log((1/accumulatedChance)*(1-HOUSETAX));
    return ((1/accumulatedChance)*(1-HOUSETAX));// Payout based on chance of winning deduced by house tax
}


app.use(express.static(__dirname + '/dist'));// Set dist folder as a static public folder
app.use(express.urlencoded({ extended: true }));// Matches content types
app.use(bodyParser.json());// Parses req body into something I can work with


app.get('/', (req,res)=>{
    initialize();
    res.sendFile(path.join(__dirname,"/dist/index.html"));// Sends the HTML built from React
})

app.get('/game/init',(req,res)=>{
    initialize();
    res.send({
        mines: gameInformation.mineAmount,
        bet: playerVolatileInformation.playerBet,
        gameState: 0,
        balance: playerBalance
    })
})

app.get('/game/verify-cell',(req,res)=>{
    console.log(req.query);
    const cell = {// Information about row and column from clicked cell to be verified to be either safe or mined
        row: parseInt(req.query.row),
        column: parseInt(req.query.column)
    }
    const isMine = hasMine(gameInformation.gameGrid,cell);// Returns true if the row and column matches an item in the gameGrid, meaning there is a mine in this cell
    gameInformation.gameState = isMine ? 2 : gameInformation.gameState; // If there is a mine in the cell the player clicked, change the game state to 2
    successfulHits = isMine ? 0 : successfulHits+1; // Resets the counter of successful hits if the player clicked a mine, add one if it was safe
    playerVolatileInformation.playerProfitMultiplier = calculateProfitMultiplier(successfulHits); // Increases player profit multiplier based on the amount of safe clicks in a row and state of the board
    playerVolatileInformation.playerProfit = isMine? 0 : playerVolatileInformation.playerBet * (playerVolatileInformation.playerProfitMultiplier-1);// Player profit is a result of bet placed times the current profit multiplier, or 0 in case of a loss
    res.send({
        hasMine: isMine,//Returns to the cell if it had a mine or not
        profitMultiplier: playerVolatileInformation.playerProfitMultiplier,// Returns to the cell the current profit multiplier, which should bubble up to the app to be then sent to the setuparea, where it will be displayed
        playerProfit: playerVolatileInformation.playerProfit,// Returns to the cell the current profit, which should bubble up to the app to be then sent to the setuparea, where it will be displayed
        gameState: gameInformation.gameState// Returns to the cell the current game state, which should bubble up to the app. Game State should be either the current state of play (1) or loss (2)
    });
});

app.post('/game/start', (req,res)=>{
    console.log(req.body);
    initialize();
    gameInformation.gameGrid = generateGrid(req.body.mines);// Client requests a grid of mines and safe cells to be built based on the amount of mines they desire
    playerBalance -= req.body.bet;// Client requests a bet to be placed, which is deduced from their balance
    playerVolatileInformation.playerBet = req.body.bet;// Client's bet request is stored in the backend to avoid client side manipulation
    console.log(gameInformation.gameGrid);
    gameInformation.gameState = 1; // Game state is 0 when there are no mines selected (initial state or restart)
    res.send({
        gameState: gameInformation.gameState,// Host responds with the current game state, either a reset (0) or play(1)
        balance: playerBalance// Host responds with the new balance
    });
});

app.post('/game/end',(req,res)=>{
    if(gameInformation.gameState!=2){
        playerBalance += playerVolatileInformation.playerProfit;
    }
    console.log(playerBalance);
    initialize();
    res.send({
        balance: playerBalance,
    });
})



app.listen(port,()=>{
    console.log(`App is listening on port ${port}`);
});