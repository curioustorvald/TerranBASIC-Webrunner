"use strict"

const TEXT_ROWS = 32
const TEXT_COLS = 80
const CW = 9
const CH = 15

let terminateRequested = false
let terminal = undefined

let com = {}
Object.freeze(com)

let graphics = {
    plotPixel: function(x, y, col) {},
    clearPixels: function(fillcol) {}
}
Object.freeze(graphics)

let sys = {
    poke: function(memaddr, byte) {},
    peek: function(memaddr) {},
    read: function() {
        // TODO
    }
}
Object.freeze(sys)

let system = {
    maxmem: function() { return 65536 }
}
Object.freeze(system)

let con = {
    clear: function() { terminal.cls() },
    color_pair: function() {},
    move: function(y,x) { terminal.cursorY = (y-1)|0; terminal.cursorX = (x-1)|0 },
    addch: function(code) { terminal.textbuffer[y][x] = code },
    getyx: function() { return [terminal.cursorY+1, terminal.cursorX+1] },
    getmaxyx: function() { return [TEXT_ROWS, TEXT_COLS] },
    resetkeybuf: function() {},
    hitterminate: function() { let b = terminateRequested; terminateRequested = false; return b },
}
Object.freeze(con)

function createNewTerminal() {
    return {
        textbuffer: Array.from({ length: TEXT_ROWS }, () => Array.from({ length: TEXT_COLS }, () => 250)),
        bgbuffer: Array.from({ length: TEXT_ROWS }, () => Array.from({ length: TEXT_COLS }, () => 255)),
        fgbuffer: Array.from({ length: TEXT_ROWS }, () => Array.from({ length: TEXT_COLS }, () => 252)),
        cursorY: 0,
        cursorX: 0,
        showcursor: true,
        
        cls: function() {
            this.textbuffer = Array.from({ length: TEXT_ROWS }, () => Array.from({ length: TEXT_COLS }, () => 0))
        },
        println: function(string) { print(string + '\n') },
        setCursorPos: function(x, y) {
            let newx = x
            let newy = y

            if (newx >= TEXT_COLS) {
                newx = 0
                newy += 1
            }
            else if (newx < 0) {
                newx = 0
            }

            if (newy < 0) {
                newy = 0 // DON'T SCROLL when cursor goes ABOVE the screen
            }
            else if (newy >= TEXT_ROWS) {
                this.scrollUp(newy - TEXT_ROWS + 1)
                this.setCursorPos(newy, TEXT_ROWS - 1)
                newy = TEXT_ROWS - 1
            }

            this.cursorX = newx
            this.cursorY = newy
        },
        scrollUp: function(size) {
            if (size < 0) throw Error(`Scroll size is lesser than zero (${size})`)
            for (let yoff = 0; yoff < TEXT_ROWS - size; yoff++) {
                textbuffer[yoff] = textbuffer[yoff + size]
            }
            for (let yoff = TEXT_ROWS - size; yoff < TEXT_ROWS; yoff++) {
                textbuffer[yoff] = Array.from({ length: TEXT_COLS }, () => 0)
            }
        },
        print: function(string) {
            // TODO
        },
    }
}

function terminate() {
    terminateRequested = true
}

function reset() {
    terminal = createNewTerminal()
    terminal.cls()
    repaint()
}

function eventKeyDown(e) {
    console.log(e)
    if (e.key.length == 1) {
        //terminal.print(e.key.charCodeAt(0))
        //terminal.cursorRight()
        repaint()
    }
}

function pageinit() {
    reset()
}

function repaint() {
    let out = ``;
    for (let y = 0; y < TEXT_ROWS; y++) {
        if (y > 0) out += `<br>`
        for (let x = 0; x < TEXT_COLS; x++) {
            if (terminal.showcursor && x == terminal.cursorX && y == terminal.cursorY)
                out += `<charcursor></charcursor>`
            
            let bgpos = codeToBgPos(terminal.textbuffer[y][x])
            out += `<charcell style="background-position: ${bgpos.x}px ${bgpos.y}px"></charcell>`
        }
    }
    
    document.getElementById('console').innerHTML = out;
}

function codeToBgPos(code) {
    return {x:-(code % 16) * CW, y:-((code / 16)|0) * CH}
}
