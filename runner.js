"use strict"

const TEXT_ROWS = 32
const TEXT_COLS = 80
const CW = 9
const CH = 15
const TAB_SIZE = 8

const CR = 0x0D
const LF = 0x0A
const TAB = 0x09
const BS = 0x08
const BEL = 0x07
const ESC = 0x1B

let stdReading = false
let stdReadbuf = ''
let terminateRequested = false
let terminal = undefined

let com = {}
Object.freeze(com)

let graphics = {
    plotPixel: function(x, y, col) {},
    clearPixels: function(fillcol) {}
}
Object.freeze(graphics)

async function startAppLoop() {
    terminateRequested = false
    await appLoop(_ => {
        //terminal.setCursorPos(1,3)
        println(Date.now())
    })
}

async function appLoop(call) {
    return new Promise((resolve) => {
        loop()
        
        function loop() {
            if (!terminateRequested) {
                call()
                setTimeout(loop, 20)
            }
        }
        
        resolve()
    })
}

async function stdReadImpl() {
    return new Promise((resolve) => {
        let stop = false
        document.getElementById("console_fake_enter_button").onchange = function(e) {
            console.log(e)
            if (e.target.checked == true) stop = true
        }
        document.getElementById("console_fake_enter_button").onchange2 = function(e) {
            console.log(e)
            if (e.checked == true) stop = true
        }
        
        loop()
        
        function loop() {
            if (stop == true) {
                stdReading = false
                document.getElementById("console_fake_enter_button").checked = false
                resolve()
            }
            setTimeout(loop, 100)
        }
    })
}

let sys = {
    poke: function(memaddr, byte) {},
    peek: function(memaddr) {},
    read: async function(callback) {
        console.log("sys.read")
        stdReadbuf = ''
        stdReading = true
        await stdReadImpl()
        callback(stdReadbuf)
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

function println(string) {
    if (string === undefined)
        print('\n', 1)
    else
        print(string + '\n', 1)
    repaint()
}

function print(string, norepaint) {
    for (let k = 0; k < string.length; k++) {
        terminal.writeOut(string.charCodeAt(k))
    }
    if (!norepaint) repaint()
}

function createNewTerminal() {
    return {
        textbuffer: Array.from({ length: TEXT_ROWS }, () => Array.from({ length: TEXT_COLS }, () => 250)),
        bgbuffer: Array.from({ length: TEXT_ROWS }, () => Array.from({ length: TEXT_COLS }, () => 255)),
        fgbuffer: Array.from({ length: TEXT_ROWS }, () => Array.from({ length: TEXT_COLS }, () => 252)),
        cursorY: 0,
        cursorX: 0,
        showcursor: true,
        
        ttyEscState: "INITIAL",
        ttyEscArguments: [],
        
        cls: function() {
            this.textbuffer = Array.from({ length: TEXT_ROWS }, () => Array.from({ length: TEXT_COLS }, () => 0))
            repaint()
        },
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
                this.textbuffer[yoff] = this.textbuffer[yoff + size]
            }
            for (let yoff = TEXT_ROWS - size; yoff < TEXT_ROWS; yoff++) {
                this.textbuffer[yoff] = Array.from({ length: TEXT_COLS }, () => 0)
            }
        },
        writeOut: function(char) {
            let printable = this.acceptChar(char) // this function processes the escape codes and CRLFs

            if (printable) {
                this.putChar(this.cursorX, this.cursorY, char)
                this.setCursorPos(this.cursorX + 1, this.cursorY) // should automatically wrap and advance a line for out-of-bound x-value
            }
        },
        putChar: function(x, y, text, foreColour, backColour) {
            this.textbuffer[y][x] = text
        },
        insertTab: function() {
            this.setCursorPos((this.cursorX / TAB_SIZE + 1) * TAB_SIZE, this.cursorY)
        },
        crlf: function() {
            let newy = this.cursorY + 1
            this.setCursorPos(0, (newy >= TEXT_ROWS) ? TEXT_ROWS - 1 : newy)
            if (newy >= TEXT_ROWS) this.scrollUp(1)
        },
        backspace: function() {
            setCursorPos(this.cursorX - 1, this.cursorY)
            putChar(this.cursorX - 1, this.cursorY, 0x20)
        },
        acceptChar: function(char) { // char: Int
            let reject = function() {
                this.ttyEscState = "INITIAL"
                this.ttyEscArguments.clear()
                return true
            }
            let accept = function(execute) {
                this.ttyEscState = "INITIAL"
                execute()
                this.ttyEscArguments.clear()
                return false
            }
            let registerNewNumberArg = function(newnum, newState) {
                this.ttyEscArguments.push((char|0) - 0x30)
                this.ttyEscState = newState
            }
            let appendToExistingNumber = function(newnum) {
                this.ttyEscArguments.push(this.ttyEscArguments.pop() * 10 + ((newnum|0) - 0x30))
            }

            //println("[tty] accepting char $char, state: $ttyEscState")

            switch (this.ttyEscState) {
                case "INITIAL": {
                    switch (char) {
                        case ESC: this.ttyEscState = "ESC"; break
                        case LF: this.crlf(); break
                        case BS: this.backspace(); break
                        case TAB: this.insertTab(); break
                        case BEL: ringBell(); break
                        case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7: 
                        case 8: case 9: case 10: case 11: case 12: case 13: case 14: case 15:
                        case 16: case 17: case 18: case 19: case 20: case 21: case 22: case 23:
                        case 24: case 25: case 26: case 27: case 28: case 29: case 30: case 31: return false
                        default: return true
                    }
                    break
                }
                case "ESC": {
                    switch (''+char) {
                        case 'c': return accept(()=>{ resetTtyStatus() })
                        case '[': this.ttyEscState = "CSI"; break
                        default: return reject()
                    }
                    break
                }
                case "CSI": {
                    switch (''+char) {
                        case 'A': return accept(()=>{ cursorUp() })
                        case 'B': return accept(()=>{ cursorDown() })
                        case 'C': return accept(()=>{ cursorFwd() })
                        case 'D': return accept(()=>{ cursorBack() })
                        case 'E': return accept(()=>{ cursorNextLine() })
                        case 'F': return accept(()=>{ cursorPrevLine() })
                        case 'G': return accept(()=>{ cursorX() })
                        case 'J': return accept(()=>{ eraseInDisp() })
                        case 'K': return accept(()=>{ eraseInLine() })
                        case 'S': return accept(()=>{ scrollUp() })
                        case 'T': return accept(()=>{ scrollDown() })
                        case 'm': return accept(()=>{ sgrOneArg() })
                        case '?': this.ttyEscState = "PRIVATESEQ"; break
                        case ';': {
                            this.ttyEscArguments.push(0)
                            this.ttyEscState = "SEP1"
                            break
                        }
                        case '0': case '1': case '2': case '3': case '4':
                        case '5': case '6': case '7': case '8': case '9': registerNewNumberArg(char, "NUM1"); break
                        default: return reject()
                    }
                    break
                }
                case "PRIVATESEQ": {
                    switch (''+char) {
                        case '0': case '1': case '2': case '3': case '4':
                        case '5': case '6': case '7': case '8': case '9': registerNewNumberArg(char, "PRIVATENUM"); break
                        default: return reject()
                    }
                    break
                }
                case "PRIVATENUM": {
                    switch (''+char) {
                        case 'h': return accept(()=>{ privateSeqH(this.ttyEscArguments.pop()) })
                        case 'l': return accept(()=>{ privateSeqL(this.ttyEscArguments.pop()) })
                        case '0': case '1': case '2': case '3': case '4':
                        case '5': case '6': case '7': case '8': case '9': appendToExistingNumber(char); break
                        default: return reject()
                    }
                    break
                }
                case "NUM1": {
                    switch (''+char) {
                        case 'A': return accept(()=>{ cursorUp(this.ttyEscArguments.pop()) })
                        case 'B': return accept(()=>{ cursorDown(this.ttyEscArguments.pop()) })
                        case 'C': return accept(()=>{ cursorFwd(this.ttyEscArguments.pop()) })
                        case 'D': return accept(()=>{ cursorBack(this.ttyEscArguments.pop()) })
                        case 'E': return accept(()=>{ cursorNextLine(this.ttyEscArguments.pop()) })
                        case 'F': return accept(()=>{ cursorPrevLine(this.ttyEscArguments.pop()) })
                        case 'G': return accept(()=>{ cursorX(ttyEscArguments.pop()) })
                        case 'J': return accept(()=>{ eraseInDisp(this.ttyEscArguments.pop()) })
                        case 'K': return accept(()=>{ eraseInLine(this.ttyEscArguments.pop()) })
                        case 'S': return accept(()=>{ scrollUp(this.ttyEscArguments.pop()) })
                        case 'T': return accept(()=>{ scrollDown(this.ttyEscArguments.pop()) })
                        case 'm': return accept(()=>{ sgrOneArg(this.ttyEscArguments.pop()) })
                        case ';': this.ttyEscState = "SEP1"; break
                        case '0': case '1': case '2': case '3': case '4':
                        case '5': case '6': case '7': case '8': case '9': appendToExistingNumber(char); break;
                        default: return reject()
                    }
                    break
                }
                case "NUM2": {
                    switch (''+char) {
                        case '0': case '1': case '2': case '3': case '4':
                        case '5': case '6': case '7': case '8': case '9': appendToExistingNumber(char); break
                        case 'H': return accept(()=>{
                            let arg2 = this.ttyEscArguments.pop()
                            let arg1 = this.ttyEscArguments.pop()
                            cursorXY(arg1, arg2)
                        })
                        case 'm': return accept(()=>{
                            let arg2 = this.ttyEscArguments.pop()
                            let arg1 = this.ttyEscArguments.pop()
                            sgrTwoArg(arg1, arg2)
                        })
                        case ';': this.ttyEscState = "SEP2"; break
                        default: return reject()
                    }
                    break
                }
                case "NUM3": {
                    switch (''+char) {
                        case '0': case '1': case '2': case '3': case '4':
                        case '5': case '6': case '7': case '8': case '9': appendToExistingNumber(char); break
                        case 'm': return accept(()=>{
                            let arg3 = this.ttyEscArguments.pop()
                            let arg2 = this.ttyEscArguments.pop()
                            let arg1 = this.ttyEscArguments.pop()
                            sgrThreeArg(arg1, arg2, arg3)
                        })
                        default: return reject()
                    }
                    break
                }
                case "SEP1": {
                    switch (''+char) {
                        case '0': case '1': case '2': case '3': case '4':
                        case '5': case '6': case '7': case '8': case '9': registerNewNumberArg(char, "NUM2"); break
                        case 'H': return accept(()=>{
                            let arg1 = this.ttyEscArguments.pop()
                            cursorXY(arg1, 0)
                        })
                        case 'm': return accept(()=>{
                            let arg1 = this.ttyEscArguments.pop()
                            sgrTwoArg(arg1, 0)
                        })
                        case ';': {
                            this.ttyEscArguments.push(0)
                            this.ttyEscState = "SEP2"
                            break
                        }
                        default: return reject()
                    }
                    break
                }
                case "SEP2": {
                    switch (''+char) {
                        case 'm': return accept(()=>{
                            let arg2 = this.ttyEscArguments.pop()
                            let arg1 = this.ttyEscArguments.pop()
                            sgrThreeArg(arg1, arg2, 0)
                        })
                        case '0': case '1': case '2': case '3': case '4':
                        case '5': case '6': case '7': case '8': case '9': registerNewNumberArg(char, "NUM3"); break
                        default: return reject()
                    }
                    break
                }
            }

            return false
        }
    }
}

function terminate() {
    terminateRequested = true
}

function reset() {
    terminateRequested = true
    
    document.getElementById("console_fake_enter_button").checked = false
    
    terminal = createNewTerminal()
    terminal.cls()
    println("Terran BASIC Web Runtime version 0.1")
    println("Terran BASIC Version 1.2")
    println("Ok")

    console.log("RESET hit")
    
    startAppLoop()
}

function keyEventToKeycode(e) {
    if (e.key.length == 1) return e.key.charCodeAt(0)
    switch (e.key) {
        case "ArrowUp": return 200
        case "ArrowLeft": return 203
        case "ArrowRight": return 205
        case "ArrowDown": return 208
        case "Backspace": return 8
        case "Tab": return 9
        case "Enter": return 13
    }
}

function eventKeyDown(e) {    
    if (stdReading) {
        let keycode = keyEventToKeycode(e)
        if (keycode == 13) {
            let btn = document.getElementById("console_fake_enter_button")
            btn.checked = true
            btn.onchange2(btn)
            println()
        }
        else if (keycode > 0) {
            stdReadbuf += String.fromCharCode(keycode)
            print(String.fromCharCode(keycode))
        }
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
