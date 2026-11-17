setTimeout(() => {
  if (Math.random() < 0.5) throw new Error('ClientTrace demo: uncaught error');
  Promise.reject(new Error('ClientTrace demo: unhandled rejection'));
}, 3000 + Math.random() * 3000);
