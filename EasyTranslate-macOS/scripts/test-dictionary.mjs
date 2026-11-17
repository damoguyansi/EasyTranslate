// 词典解析测试：查词条件与有道数据整理
import test from 'node:test';
import assert from 'node:assert/strict';
import { isLookupCandidate, parseYoudao, splitPos, createDictionary } from '../electron/dictionary.js';

test('dictionary: lookup candidates', () => {
  assert.ok(isLookupCandidate('significant'));
  assert.ok(isLookupCandidate('take off'));
  assert.ok(isLookupCandidate('重要'));
  assert.ok(!isLookupCandidate('This is a full sentence.'));
  assert.ok(!isLookupCandidate('今天天气很好我们出去玩吧'));
  assert.ok(!isLookupCandidate(''));
});

test('dictionary: split part of speech', () => {
  assert.deepEqual(splitPos('adj. 显著的；重要的'), { pos: 'adj.', text: '显著的；重要的' });
  assert.deepEqual(splitPos('无词性'), { pos: '', text: '无词性' });
});

test('dictionary: parse english entry', () => {
  const d = parseYoudao(
    {
      ec: {
        exam_type: ['CET4'],
        word: [{ ukphone: 'a', usphone: 'b', trs: [{ tr: [{ l: { i: ['adj. 显著的'] } }] }], wfs: [{ wf: { name: '比较级', value: 'more x' } }], 'return-phrase': { l: { i: 'significant' } } }]
      },
      syno: { synos: [{ syno: { pos: 'adj.', ws: [{ w: 'important' }], tran: '重要的' } }] },
      phrs: { phrs: [{ phr: { headword: { l: { i: 'significant other' } }, trs: [{ tr: { l: { i: '重要他人' } } }] } }] },
      blng_sents_part: { 'sentence-pair': [{ 'sentence-eng': 'A <b>significant</b> change.', 'sentence-translation': '重大变化。' }] }
    },
    'significant'
  );
  assert.equal(d.phonetics.length, 2);
  assert.match(d.phonetics[1].audio, /type=2/);
  assert.deepEqual(d.defs[0], { pos: 'adj.', text: '显著的' });
  assert.equal(d.synonyms[0].words[0], 'important');
  assert.equal(d.phrases[0].tran, '重要他人');
  assert.equal(d.examples[0].src, 'A significant change.');
  assert.deepEqual(d.forms[0], { name: '比较级', value: 'more x' });
});

test('dictionary: parse chinese entry and empty result', () => {
  const d = parseYoudao(
    { ce: { word: [{ phone: 'zhòng yào', trs: [{ tr: [{ l: { pos: 'n.', i: ['', { '#text': 'importance' }], '#tran': '重要性；' } }] }] }] } },
    '重要'
  );
  assert.equal(d.phonetics[0].text, 'zhòng yào');
  assert.deepEqual(d.defs[0], { pos: 'n.', text: 'importance', note: '重要性', link: true });
  assert.equal(parseYoudao({}, 'x'), null);
});

test('dictionary: skips sentences and survives network errors', async () => {
  let calls = 0;
  const dict = createDictionary(async () => {
    calls++;
    throw new Error('offline');
  });
  assert.equal(await dict.lookup('This is a long sentence here.'), null);
  assert.equal(calls, 0);
  assert.equal(await dict.lookup('hello'), null);
  assert.equal(calls, 1);
});
