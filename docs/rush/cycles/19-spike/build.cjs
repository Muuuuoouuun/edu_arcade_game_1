// Cycle 19 spike reproduction (not part of the build). Paths point at the spike container scratch folder; install @babylonjs/core and @babylonjs/materials 9.35.0 there first.
const esbuild = require('/home/user/edu_arcade_game_1/node_modules/esbuild');
const zlib = require('zlib'), fs = require('fs');
const S = '/tmp/claude-0/-home-user-edu-arcade-game-1/1003a10c-8544-5da9-9e71-63341618e930/scratchpad';
(async () => {
  for (const name of ['babylon-scene', 'three-scene']) {
    const out = `${S}/bjs-out/${name}.js`;
    await esbuild.build({ entryPoints: [`${S}/bjs-src/${name}.js`], bundle: true, minify: true, format: 'esm', outfile: out, logLevel: 'error',
      nodePaths: [`${S}/bjs-pkg/node_modules`, '/home/user/edu_arcade_game_1/node_modules'], target: 'es2020' });
    const b = fs.readFileSync(out);
    console.log(name, (b.length / 1024).toFixed(1) + ' KB min', (zlib.gzipSync(b).length / 1024).toFixed(1) + ' KB gzip');
    fs.writeFileSync(`${S}/bjs-out/${name}.html`, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}canvas{width:100%;height:100%;display:block}</style><canvas id="c"></canvas><script type="module" src="./${name}.js"></script>`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
