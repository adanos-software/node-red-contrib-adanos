"use strict";

const { AdanosClient } = require("finance-sentiment");
const { registerAdanosNodes } = require("../lib/register-nodes");

module.exports = function register(RED) {
  registerAdanosNodes(RED, (options) => new AdanosClient(options));
};
