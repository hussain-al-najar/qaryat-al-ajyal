// الخلايا العصبية: شبكة صغيرة لكل إنسان، تقرر وش يسوي في وقته. تتعلم من نتايج قراراتها وتنورث للعيال.
(function (root) {
  const VQ = (root.VQ = root.VQ || {});

  function gauss(r) {
    return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  }

  // شبكة بطبقة مخفية واحدة: inputs -> hidden (tanh) -> outputs (softmax)
  // prior: [[مدخل، مخرج، وزن]] غرايز جاهزة يولد فيها، و bias ميل مبدئي لكل مخرج
  function create(r, inputs, hidden, outputs, prior, bias) {
    const w1 = [];
    for (let i = 0; i < (inputs + 1) * hidden; i++) w1.push(gauss(r) * 0.25);
    const w2 = [];
    for (let i = 0; i < (hidden + 1) * outputs; i++) w2.push(gauss(r) * 0.2);
    const net = { n: inputs, h: hidden, o: outputs, w1, w2, skip: new Array(inputs * outputs).fill(0), decisions: 0, baseline: 0 };
    // الغريزة تربط المدخل بالمخرج مباشرة، والشبكة تعدل عليها مع الوقت
    for (const [from, to, weight] of prior || []) net.skip[from * outputs + to] = weight + gauss(r) * 0.25;
    if (bias) bias.forEach((b, o) => { net.w2[(hidden + 1) * o + hidden] = b + gauss(r) * 0.25; });
    return net;
  }

  function forward(net, input) {
    const { n, h, o, w1, w2, skip } = net;
    const hiddenOut = new Array(h);
    for (let j = 0; j < h; j++) {
      let sum = w1[j * (n + 1) + n];
      for (let i = 0; i < n; i++) sum += w1[j * (n + 1) + i] * input[i];
      hiddenOut[j] = Math.tanh(sum);
    }
    const logits = new Array(o);
    for (let k = 0; k < o; k++) {
      let sum = w2[k * (h + 1) + h];
      for (let j = 0; j < h; j++) sum += w2[k * (h + 1) + j] * hiddenOut[j];
      for (let i = 0; i < n; i++) sum += skip[i * o + k] * input[i];
      logits[k] = sum;
    }
    return { hidden: hiddenOut, logits };
  }

  function softmax(logits, mask) {
    let top = -Infinity;
    logits.forEach((v, i) => { if (!mask || mask[i]) top = Math.max(top, v); });
    const probs = logits.map((v, i) => (!mask || mask[i] ? Math.exp(v - top) : 0));
    const total = probs.reduce((a, b) => a + b, 0) || 1;
    return probs.map((p) => p / total);
  }

  function sample(r, probs) {
    let roll = r();
    for (let i = 0; i < probs.length; i++) {
      roll -= probs[i];
      if (roll <= 0 && probs[i] > 0) return i;
    }
    return probs.findIndex((p) => p > 0);
  }

  // يقرر من بين المخارج المسموحة. يرجع القرار وأثره عشان نعلّمه بعدين.
  function decide(r, net, input, mask) {
    const { hidden, logits } = forward(net, input);
    const probs = softmax(logits, mask);
    const action = sample(r, probs);
    net.decisions++;
    return { action, probs, hidden, input };
  }

  // التعلم بالمكافأة: إذا طلعت النتيجة أحسن من المتوقع يقوى القرار، وإذا أسوأ يضعف
  function learn(net, traces, reward, rate) {
    const lr = rate || 0.04;
    const edge = Math.max(-1.5, Math.min(1.5, reward - net.baseline));
    net.baseline += 0.05 * (reward - net.baseline);
    const { n, h, o, w2, skip } = net;
    for (const t of traces) {
      for (let k = 0; k < o; k++) {
        const grad = (k === t.action ? 1 : 0) - t.probs[k];
        if (!grad) continue;
        const step = lr * edge * grad;
        for (let j = 0; j < h; j++) w2[k * (h + 1) + j] += step * t.hidden[j];
        w2[k * (h + 1) + h] += step;
        for (let i = 0; i < n; i++) skip[i * o + k] += step * t.input[i] * 0.5;
      }
    }
  }

  // الولد ياخذ كل وزن من أبوه أو أمه، مع طفرة صغيرة
  function child(r, a, b) {
    const mixed = (x, y) => x.map((v, i) => {
      const base = (r() < 0.5 ? v : y[i]);
      const big = r() < 0.03;
      return base + gauss(r) * (big ? 0.4 : 0.06);
    });
    return { n: a.n, h: a.h, o: a.o, w1: mixed(a.w1, b.w1), w2: mixed(a.w2, b.w2), skip: mixed(a.skip, b.skip), decisions: 0, baseline: 0 };
  }

  VQ.Net = { create, forward, softmax, decide, learn, child };
})(typeof globalThis !== 'undefined' ? globalThis : this);
