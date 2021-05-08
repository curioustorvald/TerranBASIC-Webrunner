const ROWS = 32
const COLS = 80
const CW = 9
const CH = 15

let terminal = {
    textbuffer: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 250)),
    bgbuffer: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 255)),
    fgbuffer: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 252)),
    cursor: [1,1], // [y,x] indexed from 1
    showcursor: true,
    
    cls: function() {
        this.textbuffer = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0))
    }
}

function appendtext(e) {
    textbuffer += e.key
    console.log(e)
    //document.getElementById('console').innerText = textbuffer
}

function pageinit() {
    repaint()
}

function repaint() {
    out = ``;
    for (let y = 0; y < ROWS; y++) {
        if (y > 0) out += `<br />`
        for (let x = 0; x < COLS; x++) {
            let bgpos = codeToBgPos(terminal.textbuffer[y][x])
            out += `<charcell style="background-position: ${bgpos.x}px ${bgpos.y}px"></charcell>`
        }
    }
    document.getElementById('console').innerHTML = out;
}

function codeToBgPos(code) {
    return {x:-(code % 16) * CW, y:-((code / 16)|0) * CH}
}
