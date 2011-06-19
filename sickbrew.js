/*

(c) 2011 Eric Lewandowski.

This library is distributed under the terms of the GNU Lesser General Public
License, Version 3. A copy of the license should have been included with the
distribution. If it was not, the full text of the license, and the General
Public License upon which it is based, are available at:

http://www.gnu.org/licenses/lgpl-3.0.txt
http://www.gnu.org/licenses/gpl-3.0.txt

Please report violations to sickbrew@sickbrew.com.

*/

// Internet Explorer needs this.
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(elt /*, from*/) {
        var len = this.length;

        var from = Number(arguments[1]) || 0;
        from = (from < 0) ? Math.ceil(from) : Math.floor(from);
        if (from < 0) {
            from += len;
        }

        for (; from < len; from++) {
            if (from in this && this[from] === elt) {
                return from;
            }
        }
        return -1;
    };
}

// Firefox needs this.
if (!Function.prototype.bind) {
    Function.prototype.bind = function(scope) {
        var fn = this;
        var a1 = Array.prototype.slice.call(arguments);
        a1.shift();
        return function() {
            var a2 = Array.prototype.slice.call(arguments);
            return fn.apply(scope, a1.concat(a2));
        };
    };
}

// Everybody needs this.
if (!HTMLElement.prototype.selectContent) {
    HTMLElement.prototype.selectContent = function() {
        if (window.getSelection && window.document.createRange) {
            var sel = window.getSelection();
            var range = window.document.createRange();
            range.selectNodeContents(this);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        else if (window.document.body.createTextRange) {
            var range = window.document.body.createTextRange();
            range.moveToElementText(this);
            range.select();
        }
    };
}

(function() {
    // The SickBrew object loads appropriate scripts, CSS, and card data.
    // Possible scripts to load are defined by the 'triggers' variable in the
    // init method; each script can be triggered by the presence of a particular
    // element selector. (For example, ul.sickbrew_sealed will trigger loading
    // sealed.js.) Card data is loaded by the presence of hidden inputs like:
    //
    //   <input type="hidden" name="sickbrew_cards" value="som,mbs" />
    //
    // The above will load "cards/som.js" and "cards/mbs.js" which should, in
    // most cases, only contain a call to sickbrew.addCards.
    var SickBrew = function() {
        window.sickbrew = this;
        this.path = '';
        this.jsv = '';
        this.loaded = false;
        this.loading = [];
        this.cardListeners = [];
        this.cards = {};
        this.init();
    };
    SickBrew.prototype.init = function() {
        $((function() {
            // Derive script path and version from the sickbrew.js script element.
            var r = RegExp(/(.*)sickbrew(-v\d+)?.js/);
            $('script[src*="sickbrew"]').each((function(i, el) {
                var m = $(el).attr('src').match(r);
                if (m) {
                    this.path = m[1];
                    this.jsv = m[2] || '';
                }
            }).bind(this));
            // For each possible module, load it if a trigger element is present.
            var triggers = [
                ['ul.sickbrew_sealed', 'sealed']
            ];
            for (var i = 0; i < triggers.length; i++) {
                if ($(triggers[i][0]).length) {
                    this.script(triggers[i][1]);
                }
            }
            // Enumerate card sets to load.
            var sets = [];
            $('input[name=sickbrew_cards]').each((function(i, el) {
                var vals = el.value.split(',');
                for (var i = 0; i < vals.length; i++) {
                    if (this.loading.indexOf(vals[i]) == -1) {
                        this.loading.push(vals[i]);
                    }
                    if (sets.indexOf(vals[i]) == -1) {
                        sets.push(vals[i]);
                    }
                }
            }).bind(this));
            // Load card sets.
            for (var i = 0; i < sets.length; i++) {
                this.script('cards/' + sets[i]);
            }
        }).bind(this));
    };
    SickBrew.prototype.onSetLoad = function(set) {
        // Fires when a set's script loader completes or fails. Removes the set
        // from the list of loading sets and calls card listeners if no more
        // sets are pending.
        var i = this.loading.indexOf(set);
        if (i != -1) {
            this.loading.splice(i, 1);
            if (!this.loading.length) {
                this.loaded = true;
                for (var i = 0; i < this.cardListeners.length; i++) {
                    this.cardListeners[i]();
                }
            }
        }
    };
    SickBrew.prototype.onCardsReady = function(fn) {
        // Adds fn as a listener for card load completion.
        this.cardListeners.push(fn);
        if (this.loaded) {
            fn();
        }
    };
    SickBrew.prototype.script = function(script) {
        // Computes a script path for the given module name and adds a script
        // element to the document head. If fn function is supplied, calls it on
        // successful load or if the intended script element already exists. If
        // fne is supplied, it is called if the script element does not load.
        var src = this.path + script + this.jsv + '.js';
        if (!$('script[src="' + src + '"]').length) {
            $('head').append($(document.createElement('script'))
                .attr('type', 'text/javascript')
                .attr('src', src));
        }
    };
    SickBrew.prototype.css = function(css) {
        // Computes a URI for the given css module name and adds a stylesheet
        // link element to the document head, if it does not already exist.
        var src = this.path + css + this.jsv + '.css';
        if (!$('link[href="' + src + '"]').length) {
            $('head').append($(document.createElement('link'))
                .attr('rel', 'stylesheet')
                .attr('type', 'text/css')
                .attr('href', src));
        }
    };
    SickBrew.prototype.addCards = function(set, cards) {
        // Adds cards to the card data, overwriting any repeated names. 'set'
        // is the card set abbreviation; this will be added to each card's data.
        for (var i = 0; i < cards.length; i++) {
            var name = cards[i].name;
            if (name) {
                // If the same card is added multiple times (basic lands), use
                // the one with the highest mvid.
                if (this.cards[name] &&
                    (this.cards[name].mvid > cards[i].mvid)) {
                    continue;
                }
                this.cards[name] = cards[i];
                this.cards[name].set = set;
            }
        }
        this.onSetLoad(set);
    };
    SickBrew.prototype.goodBrowser = function() {
        // Returns true if the user agent is anything other than IE5-8.
        var m = navigator.userAgent.match(/MSIE *(\d+\.\d+)/);
        return (!m) || (Number(m[1]) >= 9);
    };

    // Create a single globally accessible instance of the SickBrew class.
    if (!window.sickbrew) {
        new SickBrew();
    }
})();
