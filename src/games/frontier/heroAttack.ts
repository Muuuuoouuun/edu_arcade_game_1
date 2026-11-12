import {HERO_MODEL} from './heroModel.ts';
export const HERO_ATTACK={contact:HERO_MODEL.contact,duration:HERO_MODEL.duration,reach:2.6,radius:1.4,interval:.62,skillRadius:8,stride:1.6} as const;
export type HeroAttack={kind:'basic'|'skill';time:number;heading:number;targetId:number|null;damage:number;hit:boolean;walkTime:number;fromMoving?:boolean;walkWeight?:number};
/** Ease the visual stride in by distance, so starting or resuming cannot snap a boot. */
export function walkContactWeight(distance:number,start?:number){if(start===undefined)return 1;const q=Math.max(0,Math.min(1,(distance-start)/.4));return q*q*(3-2*q);}
export function hammerPoint(x:number,z:number,heading:number){const [right,,forward]=HERO_MODEL.socket;return{x:x+right*Math.cos(heading)+forward*Math.sin(heading),z:z-right*Math.sin(heading)+forward*Math.cos(heading)};}
export function inHammerReach(x:number,z:number,heading:number,target:{x:number;z:number}){const p=hammerPoint(x,z,heading);return Math.hypot(target.x-p.x,target.z-p.z)<=HERO_ATTACK.radius;}
