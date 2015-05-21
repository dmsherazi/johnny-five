var Emitter = require("events").EventEmitter;
var MockFirmata = require("./util/mock-firmata");
var controller = require("./util/mock-expander-controller");
var five = require("../lib/johnny-five.js");
var sinon = require("sinon");
var Board = five.Board;
var Expander = five.Expander;
var Led = five.Led;
var Button = five.Button;

function restore(target) {
  for (var prop in target) {

    if (Array.isArray(target[prop])) {
      continue;
    }

    if (target[prop] != null && typeof target[prop].restore === "function") {
      target[prop].restore();
    }

    if (typeof target[prop] === "object") {
      restore(target[prop]);
    }
  }
}

exports["Expander"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();
    this.board = new Board({
      io: new MockFirmata(),
      debug: false,
      repl: false
    });
    done();
  },

  tearDown: function(done) {
    Expander.purge();
    restore(this);
    done();
  },

  noparams: function(test) {
    test.expect(1);

    test.throws(function() {
      new Expander();
    });

    test.done();
  },

  noController: function(test) {
    test.expect(1);

    test.throws(function() {
      new Expander({
        board: this.board
      });
    }.bind(this));

    test.done();
  },

  userController: function(test) {
    test.expect(1);

    test.doesNotThrow(function() {
      new Expander({
        board: this.board,
        controller: controller
      });
    }.bind(this));

    test.done();
  },

  emitter: function(test) {
    test.expect(1);

    var expander = new Expander({
      board: this.board,
      controller: controller
    });

    test.ok(expander instanceof Emitter);

    test.done();
  },

  initializes: function(test) {
    test.expect(1);

    this.initialize = sinon.spy(controller.initialize, "value");

    new Expander({
      board: this.board,
      controller: controller
    });

    test.equal(this.initialize.callCount, 1);

    test.done();
  },

  virtualBoardBase: function(test) {
    test.expect(5);

    var expander = new Expander({
      board: this.board,
      controller: controller
    });

    test.equal(expander.HIGH, 1);
    test.equal(expander.LOW, 0);
    test.deepEqual(expander.MODES, {});
    test.deepEqual(expander.pins, []);
    test.deepEqual(expander.analogPins, []);

    test.done();
  },

  virtualBoard: function(test) {
    test.expect(13);

    this.initialize = sinon.stub(controller.initialize, "value", function() {
      this.MODES.INPUT = this.io.MODES.INPUT;
      this.MODES.OUTPUT = this.io.MODES.OUTPUT;

      for (var i = 0; i < 8; i++) {
        this.pins.push({
          supportedModes: [
            this.io.MODES.INPUT,
            this.io.MODES.OUTPUT
          ],
          mode: 0,
          value: 0,
          report: 0,
          analogChannel: 127
        });

        this.pinMode(i, this.MODES.OUTPUT);
        this.digitalWrite(i, this.LOW);
      }

      this.name = "Expander:SOME_CHIP";
      this.isReady = true;
    });

    this.pinMode = sinon.spy(controller.pinMode, "value");
    this.digitalWrite = sinon.spy(controller.digitalWrite, "value");
    this.digitalRead = sinon.spy(controller.digitalRead, "value");

    var expander = new Expander({
      board: this.board,
      controller: controller
    });

    var board = new Board.Virtual({
      io: expander
    });

    test.equal(this.initialize.callCount, 1);
    test.equal(this.pinMode.callCount, 8);
    test.equal(this.digitalWrite.callCount, 8);
    test.equal(expander.MODES.INPUT, this.board.io.MODES.INPUT);
    test.equal(expander.MODES.OUTPUT, this.board.io.MODES.OUTPUT);

    var led = new Led({
      pin: 0,
      board: board
    });

    led.on();
    led.off();

    test.equal(this.pinMode.callCount, 9);
    test.equal(this.digitalWrite.callCount, 10);
    test.deepEqual(this.pinMode.lastCall.args, [0, 1]);
    test.deepEqual(this.digitalWrite.getCall(8).args, [0, 1]);
    test.deepEqual(this.digitalWrite.getCall(9).args, [0, 0]);

    var button = new Button({
      pin: 1,
      board: board
    });

    var callback = this.digitalRead.args[0][1];

    test.equal(this.pinMode.callCount, 10);
    test.equal(this.digitalRead.callCount, 1);

    // Fake timers and debounce don't play well.
    button.on("down", function() {
      test.ok(true);
      test.done();
    });

    callback(button.downValue);
  },
};

exports["Expander.Active"] = {
  setUp: function(done) {

    this.board = new Board({
      io: new MockFirmata(),
      debug: false,
      repl: false
    });

    this.expander = new Expander({
      controller: "PCF8574",
      board: this.board
    });
    done();
  },

  tearDown: function(done) {
    Expander.purge();
    restore(this);
    done();
  },

  has: function(test) {
    test.expect(4);

    test.equal(Expander.Active.has({ address: 0x20 }), true);
    test.equal(Expander.Active.has({ controller: "PCF8574" }), true);


    test.equal(Expander.Active.has({ address: 0x20, controller: "PCF8574" }), true);
    test.equal(Expander.Active.has({ address: 0x20, controller: "ANOTHER" }), true);

    test.done();
  },

  byAddress: function(test) {
    test.expect(2);

    test.equal(Expander.Active.byAddress(0x20), this.expander);
    test.equal(Expander.Active.byAddress(0x38), undefined);
    test.done();
  },

  byController: function(test) {
    test.expect(2);

    test.equal(Expander.Active.byController("PCF8574"), this.expander);
    test.equal(Expander.Active.byController("ANOTHER"), undefined);
    test.done();
  },
};


exports["Expander - MCP23017"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.i2cConfig = sinon.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWrite = sinon.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cRead = sinon.spy(MockFirmata.prototype, "i2cRead");

    this.board = new Board({
      io: new MockFirmata(),
      debug: false,
      repl: false
    });

    this.expander = new Expander({
      controller: "MCP23017",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Expander.purge();
    restore(this);
    done();
  },

  initialization: function(test) {
    test.expect(34);

    test.equal(this.i2cConfig.callCount, 1);
    // 2 initialization calls + (16 * (pinMode + digitalWrite))
    test.equal(this.i2cWrite.callCount, 34);

    // console.log(this.i2cWrite.getCall(0).args);
    // 2 For initialization
    test.deepEqual(this.i2cWrite.getCall(0).args, [ 32, [ 0, 255 ] ]);
    test.deepEqual(this.i2cWrite.getCall(1).args, [ 32, [ 1, 255 ] ]);

    var byte = 0x100;
    var dir = 0;
    var gpio = 18;
    var multiple = 2;

    for (var i = 2; i < 32; i += 2) {
      if (i === 18) {
        dir = 1;
        gpio = 19;
        multiple = 2;
      }

      test.deepEqual(this.i2cWrite.getCall(i).args, [ 32, [ dir, byte - multiple ] ]);
      test.deepEqual(this.i2cWrite.getCall(i + 1).args, [ 32, [ gpio, byte - multiple ] ]);

      multiple <<= 1;
    }

    test.done();
  },

  normalize: function(test) {
    test.expect(16);

    for (var i = 0; i < 16; i++) {
      test.equal(this.expander.normalize(i), i);
    }

    test.done();
  },

  pinMode: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode(i, 0);
    }

    var expects = [
      [ 32, [ 0, 1 ] ],
      [ 32, [ 0, 3 ] ],
      [ 32, [ 0, 7 ] ],
      [ 32, [ 0, 15 ] ],
      [ 32, [ 0, 31 ] ],
      [ 32, [ 0, 63 ] ],
      [ 32, [ 0, 127 ] ],
      [ 32, [ 0, 255 ] ],
      [ 32, [ 1, 1 ] ],
      [ 32, [ 1, 3 ] ],
      [ 32, [ 1, 7 ] ],
      [ 32, [ 1, 15 ] ],
      [ 32, [ 1, 31 ] ],
      [ 32, [ 1, 63 ] ],
      [ 32, [ 1, 127 ] ],
      [ 32, [ 1, 255 ] ]
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalWrite: function(test) {
    test.expect(1);

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.digitalWrite(j, 1);
    }

    var expects = [
      [ 32, [ 18, 1 ] ],
      [ 32, [ 18, 3 ] ],
      [ 32, [ 18, 7 ] ],
      [ 32, [ 18, 15 ] ],
      [ 32, [ 18, 31 ] ],
      [ 32, [ 18, 63 ] ],
      [ 32, [ 18, 127 ] ],
      [ 32, [ 18, 255 ] ],
      [ 32, [ 19, 1 ] ],
      [ 32, [ 19, 3 ] ],
      [ 32, [ 19, 7 ] ],
      [ 32, [ 19, 15 ] ],
      [ 32, [ 19, 31 ] ],
      [ 32, [ 19, 63 ] ],
      [ 32, [ 19, 127 ] ],
      [ 32, [ 19, 255 ] ]
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  pullUp: function(test) {
    test.expect(1);

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.pullUp(j, 1);
    }

    var expects = [
      [ 32, [ 12, 1 ] ],
      [ 32, [ 12, 3 ] ],
      [ 32, [ 12, 7 ] ],
      [ 32, [ 12, 15 ] ],
      [ 32, [ 12, 31 ] ],
      [ 32, [ 12, 63 ] ],
      [ 32, [ 12, 127 ] ],
      [ 32, [ 12, 255 ] ],
      [ 32, [ 13, 1 ] ],
      [ 32, [ 13, 3 ] ],
      [ 32, [ 13, 7 ] ],
      [ 32, [ 13, 15 ] ],
      [ 32, [ 13, 31 ] ],
      [ 32, [ 13, 63 ] ],
      [ 32, [ 13, 127 ] ],
      [ 32, [ 13, 255 ] ]
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalRead: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    for (var i = 0; i < 16; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cRead.reset();

    for (var j = 0; j < 16; j++) {
      this.expander.digitalRead(j, spy);
    }

    var expects = [
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 18, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ],
      [ 32, 19, 1 ]
    ];

    test.deepEqual(
      this.i2cRead.args.map(function(args) { return args.slice(0, -1); }),
      expects
    );

    test.done();
  },

  unsupported: function(test) {
    test.expect(10);

    sinon.spy(this.expander, "analogWrite");
    test.throws(this.expander.analogWrite);

    test.equal(
      this.expander.analogWrite.lastCall.exception.message,
      "Expander:MCP23017 does not support analogWrite"
    );
    sinon.spy(this.expander, "servoWrite");
    test.throws(this.expander.servoWrite);
    test.equal(
      this.expander.servoWrite.lastCall.exception.message,
      "Expander:MCP23017 does not support servoWrite"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:MCP23017 does not support i2cWrite"
    );

    sinon.spy(this.expander, "analogRead");
    test.throws(this.expander.analogRead);
    test.equal(
      this.expander.analogRead.lastCall.exception.message,
      "Expander:MCP23017 does not support analogRead"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:MCP23017 does not support i2cRead"
    );

    test.done();
  },

};

exports["Expander - MCP23008"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.i2cConfig = sinon.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWrite = sinon.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cRead = sinon.spy(MockFirmata.prototype, "i2cRead");

    this.board = new Board({
      io: new MockFirmata(),
      debug: false,
      repl: false
    });

    this.expander = new Expander({
      controller: "MCP23008",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Expander.purge();
    restore(this);
    done();
  },

  initialization: function(test) {
    test.expect(19);

    test.equal(this.i2cConfig.callCount, 1);
    // 2 initialization calls + (16 * (pinMode + digitalWrite))
    test.equal(this.i2cWrite.callCount, 17);

    // console.log(this.i2cWrite.getCall(0).args);
    // 2 For initialization
    test.deepEqual(this.i2cWrite.getCall(0).args, [ 32, [ 0, 255 ] ]);

    var byte = 0x100;
    var dir = 0;
    var gpio = 9;
    var multiple = 2;

    for (var i = 1; i < 16; i += 2) {
      test.deepEqual(this.i2cWrite.getCall(i).args, [ 32, [ dir, byte - multiple ] ]);
      test.deepEqual(this.i2cWrite.getCall(i + 1).args, [ 32, [ gpio, byte - multiple ] ]);

      multiple <<= 1;
    }

    test.done();
  },

  normalize: function(test) {
    test.expect(8);

    for (var i = 0; i < 8; i++) {
      test.equal(this.expander.normalize(i), i);
    }

    test.done();
  },

  pinMode: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 0);
    }

    var expects = [
      [ 32, [ 0, 1 ] ],
      [ 32, [ 0, 3 ] ],
      [ 32, [ 0, 7 ] ],
      [ 32, [ 0, 15 ] ],
      [ 32, [ 0, 31 ] ],
      [ 32, [ 0, 63 ] ],
      [ 32, [ 0, 127 ] ],
      [ 32, [ 0, 255 ] ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalWrite: function(test) {
    test.expect(1);

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalWrite(j, 1);
    }

    var expects = [
      [ 32, [ 9, 1 ] ],
      [ 32, [ 9, 3 ] ],
      [ 32, [ 9, 7 ] ],
      [ 32, [ 9, 15 ] ],
      [ 32, [ 9, 31 ] ],
      [ 32, [ 9, 63 ] ],
      [ 32, [ 9, 127 ] ],
      [ 32, [ 9, 255 ] ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  pullUp: function(test) {
    test.expect(1);

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.pullUp(j, 1);
    }

    var expects = [
      [ 32, [ 6, 1 ] ],
      [ 32, [ 6, 3 ] ],
      [ 32, [ 6, 7 ] ],
      [ 32, [ 6, 15 ] ],
      [ 32, [ 6, 31 ] ],
      [ 32, [ 6, 63 ] ],
      [ 32, [ 6, 127 ] ],
      [ 32, [ 6, 255 ] ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalRead: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cRead.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalRead(j, spy);
    }

    var expects = [
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ],
      [ 32, 9, 1 ]
    ];

    test.deepEqual(
      this.i2cRead.args.map(function(args) { return args.slice(0, -1); }),
      expects
    );

    test.done();
  },

  unsupported: function(test) {
    test.expect(10);

    sinon.spy(this.expander, "analogWrite");
    test.throws(this.expander.analogWrite);

    test.equal(
      this.expander.analogWrite.lastCall.exception.message,
      "Expander:MCP23008 does not support analogWrite"
    );
    sinon.spy(this.expander, "servoWrite");
    test.throws(this.expander.servoWrite);
    test.equal(
      this.expander.servoWrite.lastCall.exception.message,
      "Expander:MCP23008 does not support servoWrite"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:MCP23008 does not support i2cWrite"
    );

    sinon.spy(this.expander, "analogRead");
    test.throws(this.expander.analogRead);
    test.equal(
      this.expander.analogRead.lastCall.exception.message,
      "Expander:MCP23008 does not support analogRead"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:MCP23008 does not support i2cRead"
    );

    test.done();
  },
};

exports["Expander - PCF8574"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.i2cConfig = sinon.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWrite = sinon.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cRead = sinon.spy(MockFirmata.prototype, "i2cRead");

    this.board = new Board({
      io: new MockFirmata(),
      debug: false,
      repl: false
    });

    this.expander = new Expander({
      controller: "PCF8574",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Expander.purge();
    restore(this);
    done();
  },

  initialization: function(test) {
    test.expect(4);

    test.equal(this.i2cConfig.callCount, 1);
    // 1 initialization call + (8 * (pinMode + digitalWrite))
    test.equal(this.i2cWrite.callCount, 17);

    test.deepEqual(this.i2cWrite.getCall(0).args, [ 32, 238 ]);

    test.deepEqual(this.i2cWrite.args, [
      [ 32, 238 ],
      [ 32, 239 ],
      [ 32, 237 ],
      [ 32, 239 ],
      [ 32, 235 ],
      [ 32, 239 ],
      [ 32, 231 ],
      [ 32, 239 ],
      [ 32, 239 ],
      [ 32, 255 ],
      [ 32, 223 ],
      [ 32, 255 ],
      [ 32, 191 ],
      [ 32, 255 ],
      [ 32, 127 ],
      [ 32, 255 ],
      [ 32, 255 ]
    ]);


    test.done();
  },

  normalize: function(test) {
    test.expect(8);

    for (var i = 0; i < 8; i++) {
      test.equal(this.expander.normalize(i), i);
    }

    test.done();
  },

  pinMode: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 0);
    }

    var expects = [
      [ 32, 255 ],
      [ 32, 255 ],
      [ 32, 255 ],
      [ 32, 255 ],
      [ 32, 239 ],
      [ 32, 239 ],
      [ 32, 239 ],
      [ 32, 239 ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalWrite: function(test) {
    test.expect(1);

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalWrite(j, 1);
    }

    var expects = [
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
      [ 32, 0 ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalRead: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cRead.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalRead(j, spy);
    }

    var expects = [
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ],
      [ 32, 1 ]
    ];

    test.deepEqual(
      this.i2cRead.args.map(function(args) { return args.slice(0, -1); }),
      expects
    );

    test.done();
  },

  unsupported: function(test) {
    test.expect(10);

    sinon.spy(this.expander, "analogWrite");
    test.throws(this.expander.analogWrite);

    test.equal(
      this.expander.analogWrite.lastCall.exception.message,
      "Expander:PCF8574 does not support analogWrite"
    );
    sinon.spy(this.expander, "servoWrite");
    test.throws(this.expander.servoWrite);
    test.equal(
      this.expander.servoWrite.lastCall.exception.message,
      "Expander:PCF8574 does not support servoWrite"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:PCF8574 does not support i2cWrite"
    );

    sinon.spy(this.expander, "analogRead");
    test.throws(this.expander.analogRead);
    test.equal(
      this.expander.analogRead.lastCall.exception.message,
      "Expander:PCF8574 does not support analogRead"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:PCF8574 does not support i2cRead"
    );

    test.done();
  },
};

exports["Expander - PCF8574A"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.i2cConfig = sinon.spy(MockFirmata.prototype, "i2cConfig");
    this.i2cWrite = sinon.spy(MockFirmata.prototype, "i2cWrite");
    this.i2cRead = sinon.spy(MockFirmata.prototype, "i2cRead");

    this.board = new Board({
      io: new MockFirmata(),
      debug: false,
      repl: false
    });

    this.expander = new Expander({
      controller: "PCF8574A",
      board: this.board
    });

    this.virtual = new Board.Virtual({
      io: this.expander
    });

    done();
  },

  tearDown: function(done) {
    Expander.purge();
    restore(this);
    done();
  },

  initialization: function(test) {
    test.expect(4);

    test.equal(this.i2cConfig.callCount, 1);
    // 1 initialization call + (8 * (pinMode + digitalWrite))
    test.equal(this.i2cWrite.callCount, 17);

    test.deepEqual(this.i2cWrite.getCall(0).args, [ 56, 238 ]);

    test.deepEqual(this.i2cWrite.args, [
      [ 56, 238 ],
      [ 56, 239 ],
      [ 56, 237 ],
      [ 56, 239 ],
      [ 56, 235 ],
      [ 56, 239 ],
      [ 56, 231 ],
      [ 56, 239 ],
      [ 56, 239 ],
      [ 56, 255 ],
      [ 56, 223 ],
      [ 56, 255 ],
      [ 56, 191 ],
      [ 56, 255 ],
      [ 56, 127 ],
      [ 56, 255 ],
      [ 56, 255 ]
    ]);


    test.done();
  },

  normalize: function(test) {
    test.expect(8);

    for (var i = 0; i < 8; i++) {
      test.equal(this.expander.normalize(i), i);
    }

    test.done();
  },

  pinMode: function(test) {
    test.expect(1);

    this.i2cWrite.reset();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 0);
    }

    var expects = [
      [ 56, 255 ],
      [ 56, 255 ],
      [ 56, 255 ],
      [ 56, 255 ],
      [ 56, 239 ],
      [ 56, 239 ],
      [ 56, 239 ],
      [ 56, 239 ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalWrite: function(test) {
    test.expect(1);

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cWrite.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalWrite(j, 1);
    }

    var expects = [
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
      [ 56, 0 ],
    ];

    test.deepEqual(this.i2cWrite.args, expects);

    test.done();
  },

  digitalRead: function(test) {
    test.expect(1);

    var spy = sinon.spy();

    for (var i = 0; i < 8; i++) {
      this.expander.pinMode(i, 1);
    }

    this.i2cRead.reset();

    for (var j = 0; j < 8; j++) {
      this.expander.digitalRead(j, spy);
    }

    var expects = [
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ],
      [ 56, 1 ]
    ];

    test.deepEqual(
      this.i2cRead.args.map(function(args) { return args.slice(0, -1); }),
      expects
    );

    test.done();
  },

  unsupported: function(test) {
    test.expect(10);

    sinon.spy(this.expander, "analogWrite");
    test.throws(this.expander.analogWrite);

    test.equal(
      this.expander.analogWrite.lastCall.exception.message,
      "Expander:PCF8574A does not support analogWrite"
    );
    sinon.spy(this.expander, "servoWrite");
    test.throws(this.expander.servoWrite);
    test.equal(
      this.expander.servoWrite.lastCall.exception.message,
      "Expander:PCF8574A does not support servoWrite"
    );

    sinon.spy(this.expander, "i2cWrite");
    test.throws(this.expander.i2cWrite);
    test.equal(
      this.expander.i2cWrite.lastCall.exception.message,
      "Expander:PCF8574A does not support i2cWrite"
    );

    sinon.spy(this.expander, "analogRead");
    test.throws(this.expander.analogRead);
    test.equal(
      this.expander.analogRead.lastCall.exception.message,
      "Expander:PCF8574A does not support analogRead"
    );

    sinon.spy(this.expander, "i2cRead");
    test.throws(this.expander.i2cRead);
    test.equal(
      this.expander.i2cRead.lastCall.exception.message,
      "Expander:PCF8574A does not support i2cRead"
    );

    test.done();
  },
};
