// main.ts — interpreter for the tiny stack ISA.
// Executes bytecode with a bounded data stack and call stack.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STACK_MAX=256, CALLS_MAX=64, MEMORY_WORDS=256, STEP_LIMIT=1000000, OUTPUT_MAX=65536;
function run(program: Uint8Array, input: Uint8Array): {out: Uint8Array; code:number} {
  const d:number[]=[]; const c:number[]=[]; const m=new Int32Array(MEMORY_WORDS); const out:number[]=[];
  let pc=0, ip=0, steps=0;
  const done=(code:number)=>({out:Uint8Array.from(out),code});
  const trap=(n:number)=>done(n);
  const spec=new Map<number,[number,number]>([ // opcode stack effects: pops, then pushes
    [0, [0,0]],[1,[0,1]],[2,[0,1]],[3,[1,0]],[4,[1,2]],[5,[2,2]],[6,[2,3]],[7,[3,3]],
    ...Array.from({length:15},(_,i)=>[0x10+i, [i===7||i===11?1:2, i===7||i===11?1: i>=12?1:1]] as [number,[number,number]]),
    [0x20,[2,1]],[0x21,[2,1]],[0x22,[2,1]],[0x30,[0,0]],[0x31,[1,0]],[0x32,[1,0]],[0x33,[0,0]],[0x34,[0,0]],
    [0x40,[1,1]],[0x41,[2,0]],[0x50,[1,0]],[0x51,[1,0]],[0x52,[0,1]],[0x53,[1,0]]
  ]);
  for (;;) {
    if(steps===STEP_LIMIT)return trap(10);
    if(pc<0||pc>=program.length)return trap(9);
    const op=program[pc], s=spec.get(op); if(!s)return trap(5);
    const imm=op===1?1:op===2?4:op>=0x30&&op<=0x33?2:0;
    if(pc+imm>=program.length)return trap(9);
    steps++; const next=pc+1+imm; const [pops,pushes]=s;
    if(d.length<pops)return trap(2); if(d.length-pops+pushes>STACK_MAX)return trap(3);
    pc=next;
    const pop=()=>d.pop()!; const u=(x:number)=>x>>>0;
    if(op===0)return done(0);
    if(op===1){d.push((program[next-1]<<24)>>24);continue;}
    if(op===2){d.push((program[next-4]|program[next-3]<<8|program[next-2]<<16|program[next-1]<<24)|0);continue;}
    if(op===3){pop();continue;} if(op===4){d.push(d[d.length-1]);continue;}
    if(op===5){const b=pop(),a=pop();d.push(b,a);continue;}
    if(op===6){d.push(d[d.length-2]);continue;}
    if(op===7){const z=pop(),b=pop(),a=pop();d.push(b,z,a);continue;}
    if(op===0x30||op===0x31||op===0x32){const off=((program[next-2]|program[next-1]<<8)<<16)>>16;const v=op===0x30?1:pop();if(op===0x30||(op===0x31?v===0:v!==0))pc=next+off;continue;}
    if(op===0x33){if(c.length===CALLS_MAX)return trap(7);c.push(next);pc=program[next-2]|program[next-1]<<8;continue;}
    if(op===0x34){if(!c.length)return trap(8);pc=c.pop()!;continue;}
    if(op===0x40||op===0x41){const addr=d[d.length-1];if(addr<0||addr>=256)return trap(6);if(op===0x40)d[d.length-1]=m[addr];else{const v=d[d.length-2];d.length-=2;m[addr]=v;}continue;}
    if(op===0x50){const bytes=Buffer.from(String(d[d.length-1]));if(out.length+bytes.length>OUTPUT_MAX)return trap(11);pop();out.push(...bytes);continue;}
    if(op===0x51){if(out.length===OUTPUT_MAX)return trap(11);out.push(pop()&255);continue;}
    if(op===0x52){d.push(ip<input.length?input[ip++]:-1);continue;}
    if(op===0x53)return done(pop()&255);
    if(op===0x17){d[d.length-1]=(-d[d.length-1])|0;continue;} if(op===0x1b){d[d.length-1]=~d[d.length-1];continue;}
    const b=pop(),a=pop(); let r=0;
    switch(op){case 0x10:r=a+b;break;case 0x11:r=a-b;break;case 0x12:r=Math.imul(a,b);break;
      case 0x13:if(!b)return trap(4);r=a===-2147483648&&b===-1?a:Math.trunc(a/b);break;
      case 0x14:if(!b)return trap(4);r=b===-1?0:a%b;break;case 0x15:if(!b)return trap(4);r=Math.floor(u(a)/u(b));break;case 0x16:if(!b)return trap(4);r=u(a)%u(b);break;
      case 0x18:r=a&b;break;case 0x19:r=a|b;break;case 0x1a:r=a^b;break;case 0x1c:r=a<<(b&31);break;case 0x1d:r=a>>(b&31);break;case 0x1e:r=a>>>(b&31);break;
      case 0x20:r=a===b?1:0;break;case 0x21:r=a<b?1:0;break;case 0x22:r=u(a)<u(b)?1:0;break;default:return trap(5);}
    d.push(r|0);
  }
}
const I=process.env.MAKEFUN_INPUT_DIR??'/input', O=process.env.MAKEFUN_OUTPUT_DIR??'/output';
for(const id of readdirSync(I).sort()){const result=run(new Uint8Array(readFileSync(join(I,id,'program.bin'))),new Uint8Array(readFileSync(join(I,id,'input.bin'))));mkdirSync(join(O,id),{recursive:true});writeFileSync(join(O,id,'stdout.bin'),result.out);writeFileSync(join(O,id,'exit.txt'),`${result.code}\n`);}
