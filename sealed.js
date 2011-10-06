/*

sickbrew - a JavaScript library for rich Magic: the Gathering content
Copyright (C) 2011 Eric Lewandowski

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/

sickbrew.css('sealed');

sickbrew.onCardsReady(function() {

    var FAIL = 'This sealed deck widget depends on modern browser features, and yours does not meet the challenge. Please consider upgrading. Click <a href="#">here</a> to see the card list.';

    function gathererImage(mvid) {
        return 'http://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=' +
            mvid + '&type=card';
    }

    // TODO:
    // Unravel the circular dependencies.
    // Refactor to subclass instead of using config options for Header, etc.
    // Use only .node instead of both .el and .node.

    // class Wrapper
    // Wraps an element or set of elements in an object that manages behavior.
    //   owner - depends on subclass
    function Wrapper(owner) {
        if (owner) {
            this.owner = owner;
            this.createElements();
            if (this.el) {
                this.node = $(this.el);
            }
        }
    }
    Wrapper.prototype.createElements = function() {
        // Subclasses should override to create the elements that this Wrapper
        // wraps.
    };
    Wrapper.prototype.findBuilder = function() {
        // Searches up the owner chain, looking for a Builder.
        if (this.owner) {
            if (this.owner instanceof Builder) {
                return this.owner;
            }
            if (this.owner instanceof Wrapper) {
                return this.owner.findBuilder();
            }
        }
        return null;
    };
    // Hover tracking: call trackHover() to start tracking mouse over/out
    // events, adding the 'hover' class to the wrapper's node.
    Wrapper.prototype.trackHover = function() {
        this.node.bind('mouseover', this.onHoverOver.bind(this));
        this.node.bind('mouseout', this.onHoverOut.bind(this));
    };
    Wrapper.prototype.onHoverOver = function(evt) {
        this.node.addClass('hover');
        evt.stopPropagation();
    };
    Wrapper.prototype.onHoverOut = function(evt) {
        this.node.removeClass('hover');
        evt.stopPropagation();
    };
    // Selection tracking: call trackSelect() to track select/deselect on click
    // events. Adds or removes this item from the Builder's selection array.
    Wrapper.prototype.trackSelect = function() {
        this.selected = false;
        this.node.bind('click', this.onSelect.bind(this));
    };
    Wrapper.prototype.onSelect = function(evt) {
        if (this.selected) {
            this.deselect();
        }
        else {
            this.select();
        }
        evt.stopPropagation();
    };
    Wrapper.prototype.select = function() {
        var builder = this.findBuilder();
        if (builder && (builder.selection.indexOf(this) == -1)) {
            builder.selection.push(this);
        }
        this.selected = true;
        this.node.addClass('selected');
    };
    Wrapper.prototype.deselect = function() {
        var builder = this.findBuilder();
        if (builder) {
            var index = builder.selection.indexOf(this);
            if (index != -1) {
                builder.selection.splice(index, 1);
            }
        }
        this.selected = false;
        this.node.removeClass('selected');
    };


    // class Preview
    // Represents a full-size card preview window.
    //   owner - a Builder
    function Preview(owner) {
        if (owner) {
            this.showing = null;
        }
        Wrapper.call(this, owner);
    }
    Preview.prototype = new Wrapper();
    Preview.prototype.createElements = function() {
        this.el = document.createElement('img');
        this.el.setAttribute('class', 'sbbPreview');
        $('body').prepend(this.el);
    };
    Preview.prototype.show = function(card) {
        this.el.src = card.img.src;
        this.showing = card;
        var offs = this.owner.node.offset();
        var pLeft = offs.left + this.owner.node.outerWidth() + 5;
        var pTop = Math.min(card.node.offset().top, offs.top +
                            this.owner.node.outerHeight() - this.el.height);
        this.node.css('left', pLeft + 'px')
                 .css('top', pTop + 'px')
                 .css('display', 'block');
    };
    Preview.prototype.hide = function(card) {
        if (this.showing == card) {
            this.showing = null;
            this.node.css('display', '');
        }
    };


    // class Container
    // Represents an element or set of elements that can contain cards.
    //   owner - depends on subclass
    function Container(owner) {
        Wrapper.call(this, owner);
    }
    Container.prototype = new Wrapper();
    Container.prototype.canAccept = function(card) {
        // Return false if the container should destroy the card instead of
        // accepting it.
        return true;
    };
    Container.prototype.addCard = function(card) {
        // All containers should support addCard, accepting a Card object.
    };
    Container.prototype.getCards = function() {
        return $(this.el).children('a.sbbCard');
    };
    Container.prototype.hasOnlyLands = function() {
        var cards = this.getCards();
        for (var i = 0; i < cards.length; i++) {
            var data = $(cards[i]).data('wrapper');
            if (data && data.data && data.data.cardtype &&
                (data.data.cardtype.search(/Land ?/) == -1)) {
                return false;
            }
        }
        return true;
    };
    // Target tracking - call trackTarget() to enable this container as a target
    // for card movement; when the user clicks the node, all selected cards in
    // the Builder will be moved here.
    Container.prototype.trackTarget = function() {
        this.node.bind('click', this.onTarget.bind(this));
    };
    Container.prototype.onTarget = function(evt) {
        var builder = this.findBuilder();
        if (builder) {
            while (builder.selection.length) {
                var item = builder.selection.shift();
                item.deselect();
                this.addCard(item);
            };
        }
    };


    // class Builder
    // This container represents a <table> that holds the limited pool deck
    // builder.
    //   owner - a <ul> node that holds the card pool
    function Builder(owner) {
        if (owner) {
            this.selection = [];
            this.sections = {};
            this.failed = false;
        }
        Container.call(this, owner);
        if (owner) {
            if (!this.failed) {
                this.loadCards();
            }
        }
    }
    Builder.prototype = new Container();
    Builder.prototype.createElements = function() {
        if (!sickbrew.goodBrowser()) {
            this.fail();
            return;
        }
        this.el = document.createElement('table');
        this.el.setAttribute('class', 'SickBrewBuilder');
        this.owner.after(this.el);
        this.sections.bin = new Bin(this, 'Junk');
        this.sections.pool = new Grid(this, 'Pool');
        this.sections.deck = new Grid(this, 'Deck', true);
        this.preview = new Preview(this);

        var tr = $(document.createElement('tr'));
        var td = $(document.createElement('td'));
        td.html('powered by <a href="http://sickbrew.com">sickbrew</a>')
          .attr('colspan', '7');
        tr.append(td)
          .addClass('sbbCredit');
        $(this.el).append(tr);
    };
    Builder.prototype.fail = function() {
        this.el = document.createElement('div');
        this.owner.after($(this.el).html(FAIL)
                                   .attr('class', 'sbbFail'));
        $(this.el).find('a').click((function() {
            $(this.el).css('display', 'none');
            this.owner.css('display', 'block');
        }).bind(this));
        this.failed = true;
    };
    Builder.prototype.loadCards = function() {
        // Find all <li> tags in the owner. Create a Card for each, choose a
        // sort method, and display the cards.
        var lis = this.owner.find('li');
        for (var i = 0; i < lis.length; i++) {
            var t = $(lis[i]).html();
            var m = t.match(/^(\d+) (.+)/);
            var cards = [];
            for (var j = 0; j < (m ? Number(m[1]) : 1); j++) {
                cards.push(new Card(this, m ? m[2] : t));
            }
            this.chooseSort(cards);
            for (var j = 0; j < cards.length; j++) {
                this.sections.pool.addCard(cards[j]);
            }
        }
    };
    Builder.prototype.addLand = function(name) {
        var card = new Card(this, name);
        card.basic = true;
        this.sections.deck.addLand(card);
    };
    Builder.prototype.SORT_DEFAULT =
        {'W': 0, 'U': 1, 'B': 2, 'R': 3, 'G': 4, 'C': 5};
    Builder.prototype.chooseSort = function(cards) {
        // Collect color counts, then choose a sort function based on the
        // distribution. Mostly artifacts (Mirrodin or Scars block) gets the
        // artifact sort. TODO: Ravnica, Shadowmoor, and Alara block.
        var counts = [0, 0, 0, 0, 0, 0, 0];
        var color = '';
        for (var i = 0; i < cards.length; i++) {
            if (!cards[i].data) {
                continue;
            }
            color = cards[i].data.color;
            // Gold cards (such as color: WU) go in slot 6.
            if (color.length > 1) {
                counts[6] += 1;
            }
            else {
                if (isFinite(this.SORT_DEFAULT[color])) {
                    counts[this.SORT_DEFAULT[color]] += 1;
                }
            }
        }
        if (Math.max.apply(this, counts) == counts[5]) {
            this.sort = this.sortArtifact;
            return;
        }
        this.sort = this.sortDefault;
    };
    Builder.prototype.sortDefault = function(data) {
        // Sort typical card pools.
        if (isFinite(this.SORT_DEFAULT[data.color])) {
            return this.SORT_DEFAULT[data.color];
        }
        return 6;
    };
    Builder.prototype.sortArtifact = function(data) {
        // Sort an artifact-heavy pool.
        if (this.SORT_DEFAULT[data.color] < 5) {
            return this.SORT_DEFAULT[data.color];
        }
        return (data.cardtype.search(/Creature/) != -1) ? 6 : 5;
    };
    Builder.prototype.SORT_RARITY = {'M': 0, 'R': 1, 'U': 2, 'L': 6};
    Builder.prototype.sortRarity = function(data) {
        if (isFinite(this.SORT_RARITY[data.rarity])) {
            return this.SORT_RARITY[data.rarity];
        }
        // Color-sort the commons over the columns 4-6.
        var color = 6;
        if (this.SORT_DEFAULT[data.color] < 5) {
            color = this.SORT_DEFAULT[data.color];
        }
        return 3 + Math.floor(color / 3);
    };
    Builder.prototype.sortCost = function(data) {
        return Math.min(data.cmc || 0, 6);
    };
    Builder.prototype.getSortCell = function(data) {
        if (this.sort) {
            return this.sort(data);
        }
        return this.sortDefault(data);
    };


    // class Section
    // This container is a superclass for Grid and Bin. It represents one or
    // more table rows that can contain cards.
    //   owner - a Builder
    function Section(owner, title, sorts, landctrl) {
        if (owner) {
            this.title = title;
            this.sorts = sorts;
            this.landctrl = landctrl;
            this.header = null;
            this.rows = [];
            this.cardMoved = false;
            $(document).bind('sickbrew:cardmove', this.onCardMove.bind(this));
        }
        Container.call(this, owner);
    }
    Section.prototype = new Container();
    Section.prototype.createElements = function() {
        this.header = new Header(this, this.title, this.sorts, this.landctrl);
    };
    Section.prototype.addRow = function(klass, big, store) {
        // Create a table row with css class klass. If big=true, it will have
        // seven cells.
        var row = new Row(this, klass, big);
        if (store != false) { // undefined -> true
            this.rows.push(row);
            row.trackHover();
            row.trackTarget();
        }
        return row;
    };
    Section.prototype.getCardCount = function() {
        var r = 0;
        for (var i = 0; i < this.rows.length; i++) {
            r += this.rows[i].getCardCount();
        }
        return r;
    };
    Section.prototype.onCardMove = function() {
        if (!this.cardMoved) {
            this.cardMoved = true;
            setTimeout(this.doOnCardMove.bind(this), 1);
        }
    };
    Section.prototype.doOnCardMove = function() {
        this.cardMoved = false;
        // update the card count
        var ct = this.getCardCount();
        this.header.count.innerHTML = ct + ' card' + ((ct == 1) ? '' : 's');
        if (this.landctrl && this.header.node.hasClass('sbbShowDecklist')) {
            this.header.generateList();
        }
    };


    // class Header
    // This row represents the header of a section.
    //   owner - a Section
    function Header(owner, title, sorts, landctrl) {
        if (owner) {
            this.title = title;
            this.sorts = sorts;
            this.landctrl = landctrl;
            this.row = null;
            this.cell = null;
        }
        Wrapper.call(this, owner);
    }
    Header.prototype = new Wrapper();
    Header.prototype.createElements = function() {
        this.row = this.owner.addRow('sbbHeader', true, false);
        this.el = this.row.el;

        this.cell = this.row.cells[0];
        this.cell.el.innerHTML = this.title;

        this.count = document.createElement('span');
        $(this.count).addClass('sbbHeaderCount');
        this.cell.el.appendChild(this.count);

        if (this.sorts) {
            this.addSorts();
        }

        if (this.landctrl) {
            this.land = $(document.createElement('a'));
            this.land.addClass('sbbHeaderLandBtn')
                     .html('lands')
                     .click(this.onLandClick.bind(this));

            this.list = $(document.createElement('a'));
            this.list.addClass('sbbHeaderListBtn')
                     .html('list')
                     .click(this.onListClick.bind(this));

            this.decklist = $(document.createElement('pre'));

            $(this.cell.el).append(this.land)
                           .append(this.list)
                           .append(this.decklist);

            this.lands = new Lands(this);


        }
    };
    Header.prototype.onLandClick = function() {
        this.node.removeClass('sbbShowDecklist')
                 .toggleClass('sbbShowLands');
    };
    Header.prototype.onListClick = function() {
        this.node.removeClass('sbbShowLands')
                 .toggleClass('sbbShowDecklist');
        if (this.node.hasClass('sbbShowDecklist')) {
            this.generateList(true);
        }
    };
    Header.prototype.generateList = function(select) {
        var deck = this.owner;
        var lands = [];
        var dudes = [];
        var spells = [];
        for (var i = 0; i < deck.rows.length; i++) {
            var row = deck.rows[i];
            for (var j = 0; j < row.cells.length; j++) {
                var cell = row.cells[j];
                for (var k = 0; k < cell.cards.length; k++) {
                    var card = cell.cards[k];
                    var cardtype = card.data.cardtype;
                    if (cardtype.search(/Land/) != -1) {
                        lands.push(card.name);
                    }
                    else if (cardtype.search(/Creature/) != -1) {
                        dudes.push(card.name);
                    }
                    else {
                        spells.push(card.name);
                    }
                }
            }
        }
        var list = this.buildList(lands, 'Lands') +
                   this.buildList(dudes, 'Creatures') +
                   this.buildList(spells, 'Spells');
        if (list) {
            this.decklist.html(list);
            if (select) {
                this.decklist.get(0).selectContent();
            }
        }
        else {
            this.decklist.html('Add some cards to the deck!');
        }
    };
    Header.prototype.buildList = function(cards, label) {
        var list = [];
        var card = null;
        var working = null;
        var count = 0;
        while (card = cards.shift()) {
            if (card == working) {
                count += 1;
            }
            else {
                if (working) {
                    list.push(count + ' ' + working);
                }
                count = 1;
                working = card;
            }
        }
        if (count) {
            list.push(count + ' ' + working);
        }
        return list.length ? label + '\n' + list.join('\n') + '\n\n' : '';
    };
    Header.prototype.onSort = function(evt) {
        this.owner.sort(evt.data.fn.bind(this.findBuilder()));
    };
    Header.prototype.addSort = function(label, fn) {
        var sort = document.createElement('a');
        sort.setAttribute('class', 'sbbHeaderRBtn');
        sort.innerHTML = label;
        $(sort).bind('click', {fn: fn}, this.onSort.bind(this));
        this.cell.node.append(sort);
    };
    Header.prototype.addSorts = function() {
        this.addSort('color', Builder.prototype.getSortCell);
        this.addSort('rarity', Builder.prototype.sortRarity);
        this.addSort('cost', Builder.prototype.sortCost);
    };


    // class Grid
    // This container is a collection of rows with seven cells each that expands
    // and contracts as necessary.
    //   owner - a Builder
    function Grid(owner, title, landctrl) {
        Section.call(this, owner, title, true, landctrl);
    }
    Grid.prototype = new Section();
    Grid.prototype.createElements = function() {
        Section.prototype.createElements.call(this);
        this.addRow('sbbGrid');
    };
    Grid.prototype.doOnCardMove = function() {
        Section.prototype.doOnCardMove.call(this);
        // Delete any empty rows except the last one.
        var i = 0;
        while (i < this.rows.length - 1) {
            if (this.rows[i].isEmpty()) {
                this.rows[i].node.remove();
                this.rows.splice(i, 1);
            }
            else {
                i++;
            }
        }
        // If the last row is not empty, add a row.
        if (this.rows.length && !this.rows[this.rows.length-1].isEmpty()) {
            this.addRow('sbbGrid');
        }
    };
    Grid.prototype.canAccept = function(card) {
        return this.landctrl || !card.basic;
    };
    Grid.prototype.addCard = function(card) {
        Section.prototype.addCard.call(this, card);
        this.rows[0].addCard(card);
    };
    Grid.prototype.sort = function(fn) {
        for (var i = 0; i < this.rows.length; i++) {
            this.rows[i].sort(fn, this.rows[0]);
        }
    };
    Grid.prototype.addLand = function(card) {
        var cell = null;
        for (var row = 0; row < this.rows.length; row++) {
            for (var col = 0; col < this.rows[row].cells.length; col++) {
                if (this.rows[row].cells[col].hasOnlyLands()) {
                    cell = this.rows[row].cells[col];
                    break;
                }
            }
            if (cell) {
                break;
            }
        }
        if (!cell) {
            cell = this.rows[0].cells[0];
        }
        cell.addCard(card);
    };


    // class Bin
    // This container has a single row with a single cell meant for holding
    // unimportant cards; it has smaller display and may not have organization
    // features.
    //   owner - a Builder
    function Bin(owner, title) {
        Section.call(this, owner, title);
    }
    Bin.prototype = new Section();
    Bin.prototype.createElements = function() {
        Section.prototype.createElements.call(this);
        this.addRow('sbbBin', true);
    };


    // class Row
    // This container represents a table row with one or more cells.
    //   owner - a Section
    function Row(owner, klass, big) {
        if (owner) {
            this.klass = klass;
            this.big = big;
            this.cells = [];
        }
        Container.call(this, owner);
    }
    Row.prototype = new Container();
    Row.prototype.createElements = function() {
        this.el = document.createElement('tr');
        if (this.klass) {
            this.el.setAttribute('class', this.klass);
        }
        var cap = (this.big ? 1 : 7);
        for (var i = 0; i < cap; i++) {
            this.addCell(this.big);
        }
        var last = this.owner.rows.length ?
                   this.owner.rows[this.owner.rows.length - 1] :
                   this.owner.header;
        if (last) {
            $(last.el).after(this.el);
        }
        else {
            this.owner.owner.el.appendChild(this.el);
        }
    };
    Row.prototype.addCell = function() {
        var cell = new Cell(this, this.big);
        this.cells.push(cell);
        return cell;
    };
    Row.prototype.canAccept = function(card) {
        return this.owner.canAccept(card);
    };
    Row.prototype.addCard = function(card) {
        Container.prototype.addCard.call(this, card);
        if (card.data) {
            var cell = this.findBuilder().getSortCell(card.data);
            this.cells[cell].addCard(card);
        }
        else {
            if (window.console) {
                console.log('bad: ' + card.name);
            }
        }
    };
    Row.prototype.isEmpty = function() {
        for (var i = 0; i < this.cells.length; i++) {
            if (!this.cells[i].isEmpty()) {
                return false;
            }
        }
        return true;
    };
    Row.prototype.getCardCount = function() {
        var r = 0;
        for (var i = 0; i < this.cells.length; i++) {
            r += this.cells[i].getCardCount();
        }
        return r;
    };
    Row.prototype.trackHover = function() {
        for (var i = 0; i < this.cells.length; i++) {
            this.cells[i].trackHover();
        }
    };
    Row.prototype.trackTarget = function() {
        for (var i = 0; i < this.cells.length; i++) {
            this.cells[i].trackTarget();
        }
    };
    Row.prototype.sort = function(fn, target) {
        for (var i = 0; i < this.cells.length; i++) {
            this.cells[i].sort(fn, target);
        }
    };


    // class Cell
    // This container represents a table cell that can hold cards.
    //   owner - a Row
    function Cell(owner, big) {
        if (owner) {
            this.big = big;
            this.cards = [];
        }
        Container.call(this, owner);
    }
    Cell.prototype = new Container();
    Cell.prototype.createElements = function() {
        this.el = document.createElement('td');
        if (this.big) {
            this.el.setAttribute('colspan', 7);
        }
        this.owner.el.appendChild(this.el);
    };
    Cell.prototype.canAccept = function(card) {
        return this.owner.canAccept(card);
    };
    Cell.prototype.addCard = function(card) {
        Container.prototype.addCard.call(this, card);
        if (card.cell != this) {
            if (card.cell) {
                var index = card.cell.cards.indexOf(card);
                if (index != -1) {
                    card.cell.cards.splice(index, 1);
                }
            }
            if (this.canAccept(card)) {
                card.cell = this;
                this.cards.push(card);
            }
            else {
                card.destroy();
            }
        }
        if (card.el) {
            this.el.appendChild(card.el);
        }
        $(document).trigger('sickbrew:cardmove');
    };
    Cell.prototype.isEmpty = function() {
        return this.cards.length == 0;
    };
    Cell.prototype.getCardCount = function() {
        return this.cards.length;
    };
    Cell.prototype.sort = function(fn, target) {
        var cards = this.cards.slice();
        while (cards.length) {
            var card = cards.shift();
            var index = fn(card.data);
            target.cells[index].addCard(card);
        }
    };


    // class Card
    // This represents an <img> element for a single card.
    //   owner - the Builder
    function Card(owner, name) {
        if (owner) {
            this.cell = null;
            this.name = name;
            this.data = sickbrew.cards[name];
            this.container = null;
        }
        Wrapper.call(this, owner);
        if (owner) {
            this.trackHover();
            this.trackSelect();
        }
    }
    Card.prototype = new Wrapper();
    Card.prototype.createElements = function() {
        this.el = document.createElement('a');
        this.el.setAttribute('class', 'sbbCard');
        this.img = document.createElement('img');
        this.img.src = this.getSrc();
        this.el.appendChild(this.img);
        $(this.el).data('wrapper', this);
    };
    Card.prototype.getSrc = function() {
        return this.data ? gathererImage(this.data.mvid) : '0';
    };
    Card.prototype.destroy = function() {
        this.el.parentNode.removeChild(this.el);
        this.el = null;
    };
    Card.prototype.onHoverOver = function(evt) {
        Wrapper.prototype.onHoverOver.call(this, evt);
        var builder = this.findBuilder();
        if (builder && builder.preview) {
            builder.preview.show(this);
        }
    };
    Card.prototype.onHoverOut = function(evt) {
        Wrapper.prototype.onHoverOut.call(this, evt);
        var builder = this.findBuilder();
        if (builder && builder.preview) {
            builder.preview.hide(this);
        }
    };


    function Lands(owner) {
        Wrapper.call(this, owner);
    }
    Lands.prototype = new Wrapper();
    Lands.prototype.cards = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
    Lands.prototype.createElements = function() {
        this.el = document.createElement('div');
        this.el.setAttribute('class', 'sbbLands');
        $(this.owner.el).find('td').append(this.el);
        this.createCards();
    };
    Lands.prototype.clickCard = function(card, count) {
        var builder = this.findBuilder();
        for (var i = 0; i < (count || 1); i++) {
            builder.addLand(card);
        }
    };
    Lands.prototype.createCard = function(data) {
        var img = $(document.createElement('img'));
        img.attr('src', gathererImage(data.mvid));

        var div = $(document.createElement('div'));
        for (var i = 1; i < 6; i++) {
            var num = $(document.createElement('a'));
            num.html(String(i))
               .click(this.clickCard.bind(this, data.name, i));
            div.append(num);
        }

        var card = $(document.createElement('a'));
        card.addClass('sbbLand')
            .append(img)
            .append(div);

        $(this.el).append(card);
    };
    Lands.prototype.createCards = function() {
        for (var i = 0; i < this.cards.length; i++) {
            var data = sickbrew.cards[this.cards[i]];
            if (data) {
                this.createCard(data);
            }
        }
    };


    if (!sickbrew.builders) {
        sickbrew.builders = [];
    }
    // Initialize: create a Builder for each <ul> with class="sickbrew_sealed".
    $('ul.sickbrew_sealed').each(function(index, el) {
        sickbrew.builders.push(new Builder($(el)));
    });
});
