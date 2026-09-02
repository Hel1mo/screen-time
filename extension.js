import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class ScreenTimeExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._dataFile = Gio.File.new_for_path(
            GLib.build_filenamev([
                GLib.get_user_data_dir(),
                'screentime@helimo.json',
            ])
        );

        this._today = this._getToday();
        this._history = {};
        this._selectedDate = this._today;

        this._timerId = null;
        this._saveTimerId = null;
        this._settingsChangedId = null;
        
        

        this._loadData();
        this._ensureToday();
        
        const interval =
    this._settings.get_int('notification-interval');

this._nextNotification =
    (Math.floor(
        this._todayData.screenTime / interval
    ) + 1) * interval;
    
        

        if (this._settings.get_boolean('reset-data')) {
            this._resetToday();
            this._settings.set_boolean('reset-data', false);
        }

        // Top bar indicator
        this._indicator = new PanelMenu.Button(
            0.0,
            this.metadata.name,
            false
        );

        this._box = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
            vertical: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._label = new St.Label({
            text: '0s',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._box.add_child(this._label);
        this._indicator.add_child(this._box);

        Main.panel.addToStatusArea(
            this.uuid,
            this._indicator
        );

        this._tracker = Shell.WindowTracker.get_default();

        // Count every second
        this._timerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            1,
            () => {
                this._tick();
                return GLib.SOURCE_CONTINUE;
            }
        );

        // Save every 10 seconds
        this._saveTimerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            10,
            () => {
                this._saveData();
                return GLib.SOURCE_CONTINUE;
            }
        );

        this._settingsChangedId = this._settings.connect(
            'changed',
            () => {
                if (this._settings.get_boolean('reset-data')) {
                    this._resetToday();
                    this._settings.set_boolean(
                        'reset-data',
                        false
                    );
                }

                this._updateUI();
            }
        );

        this._updateUI();
    }
    
    _getThemeAccentColor() {
    try {
        const [, stdout] = GLib.spawn_command_line_sync(
            `bash -c "THEME=$(gsettings get org.gnome.desktop.interface gtk-theme | tr -d \\\\'); grep -RhoE '@define-color (accent_color|selected_bg_color) #[0-9a-fA-F]{6}' \\"/usr/share/themes/$THEME\\" 2>/dev/null | head -1 | grep -oE '#[0-9a-fA-F]{6}'"`
        );

        const color = new TextDecoder()
            .decode(stdout)
            .trim();

        if (/^#[0-9a-fA-F]{6}$/.test(color))
            return color;

    } catch (error) {
        console.error(
            `Screen Time: couldn't get theme accent: ${error}`
        );
    }

    return '#3584e4';
}

    _getToday() {
        const now = new Date();

        return `${now.getFullYear()}-` +
            `${String(now.getMonth() + 1).padStart(2, '0')}-` +
            `${String(now.getDate()).padStart(2, '0')}`;
    }

    _ensureToday() {
        if (!this._history[this._today]) {
            this._history[this._today] = {
                screenTime: 0,
                appTimes: {},
                appIcons: {},
            };
        }

        this._todayData = this._history[this._today];

        // Make old saved data compatible
        if (!this._todayData.appTimes)
            this._todayData.appTimes = {};

        if (!this._todayData.appIcons)
            this._todayData.appIcons = {};
    }

    _loadData() {
        try {
            if (!this._dataFile.query_exists(null))
                return;

            const [ok, contents] =
                this._dataFile.load_contents(null);

            if (!ok)
                return;

            const text =
                new TextDecoder().decode(contents);

            const data = JSON.parse(text);

            if (data.history &&
                typeof data.history === 'object') {
                this._history = data.history;

                // Upgrade old saved days
                for (const day of Object.values(
                    this._history
                )) {
                    if (!day.appTimes)
                        day.appTimes = {};

                    if (!day.appIcons)
                        day.appIcons = {};
                }
            }
        } catch (error) {
            console.error(
                `Screen Time: failed to load data: ${error}`
            );
        }
    }

    _saveData() {
        try {
            const data = {
                version: 2,
                history: this._history,
            };

            const text = JSON.stringify(data);
            const bytes =
                new TextEncoder().encode(text);

            this._dataFile.replace_contents(
                bytes,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (error) {
            console.error(
                `Screen Time: failed to save data: ${error}`
            );
        }
    }

    _resetToday() {
        this._history[this._today] = {
            screenTime: 0,
            appTimes: {},
            appIcons: {},
        };

        this._todayData =
            this._history[this._today];

        this._selectedDate = this._today;

        this._saveData();
        this._updateUI();
    }

    _tick() {
    const today = this._getToday();

    // Midnight rollover
    if (today !== this._today) {
        this._today = today;
        this._ensureToday();

        this._selectedDate = today;

        // Start the notification cycle again
        const interval =
    this._settings.get_int(
        'notification-interval'
    );

this._nextNotification = interval;

        this._saveData();
    }

    // Always count screen time
    this._todayData.screenTime++;

const notificationsEnabled =
    this._settings.get_boolean(
        'notifications-enabled'
    );

const interval =
    this._settings.get_int(
        'notification-interval'
    );

if (
    notificationsEnabled &&
    this._todayData.screenTime >= this._nextNotification
) {
    this._showUsageNotification(
        this._todayData.screenTime
    );

    this._nextNotification += interval;
}

    // Track focused application
    const window =
        global.display.get_focus_window();

    if (window) {
        const app =
            this._tracker.get_window_app(window);

        if (app) {
            const name = app.get_name();

            this._todayData.appTimes[name] =
                (this._todayData.appTimes[name] || 0) + 1;

            const appInfo = app.get_app_info();

            if (appInfo) {
                this._todayData.appIcons[name] =
                    appInfo.get_id();
            }
        }
    }

    this._updateUI();
}
    _updateUI() {
        if (!this._todayData)
            return;

        const showSeconds =
            this._settings.get_boolean('show-seconds');

        const showApps =
            this._settings.get_boolean(
                'show-app-breakdown'
            );

        // The day currently selected in the graph
        const selectedDate =
            this._selectedDate || this._today;

        const selectedData =
            this._history[selectedDate] || {
                screenTime: 0,
                appTimes: {},
                appIcons: {},
            };

        // Top bar ALWAYS shows today's live time
        this._label.text = this._formatTime(
            this._todayData.screenTime,
            showSeconds
        );

        this._indicator.menu.removeAll();

        // Header for selected day
        const dateObject =
            new Date(`${selectedDate}T12:00:00`);

        const prettyDate =
            selectedDate === this._today
                ? 'Today'
                : dateObject.toLocaleDateString(
                    undefined,
                    {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                    }
                );

        const totalItem =
            new PopupMenu.PopupMenuItem(
                `${prettyDate} - ${this._formatTime(
                    selectedData.screenTime || 0,
                    showSeconds
                )}`
            );

        totalItem.reactive = false;

        this._indicator.menu.addMenuItem(
            totalItem
        );

        // Graph
        this._indicator.menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );

        this._addSectionHeader('Last 7 days');
        this._addWeeklyGraph();

        // Apps for selected day
        if (!showApps)
            return;

        this._indicator.menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );

        this._addSectionHeader('Top applications');

        const entries = Object.entries(
            selectedData.appTimes || {}
        ).sort((a, b) => b[1] - a[1]);

        if (entries.length === 0) {
            const item =
                new PopupMenu.PopupMenuItem(
                    'No application activity'
                );

            item.reactive = false;

            this._indicator.menu.addMenuItem(item);
            return;
        }

        for (const [name, seconds] of entries) {
            const item =
                new PopupMenu.PopupBaseMenuItem({
                    reactive: false,
                    can_focus: false,
                });

            let gicon = null;

            const appId =
                selectedData.appIcons?.[name];

            if (appId) {
                try {
                    const appInfo =
                        Gio.DesktopAppInfo.new(appId);

                    gicon =
                        appInfo?.get_icon() || null;
                } catch (error) {
                    gicon = null;
                }
            }

            // Fallback icon
            if (!gicon) {
                gicon = new Gio.ThemedIcon({
                    name:
                        'application-x-executable-symbolic',
                });
            }

            const icon = new St.Icon({
                gicon,
                icon_size: 20,
                style_class: 'popup-menu-icon',
                y_align: Clutter.ActorAlign.CENTER,
            });

            const appName = new St.Label({
                text: name,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });

            const time = new St.Label({
                text: this._formatTime(
                    seconds,
                    showSeconds
                ),
                y_align: Clutter.ActorAlign.CENTER,
            });

            item.add_child(icon);
            item.add_child(appName);
            item.add_child(time);

            this._indicator.menu.addMenuItem(item);
        }
    }

    _addSectionHeader(text) {
        const item =
            new PopupMenu.PopupMenuItem(text);

        item.reactive = false;
        item.add_style_class_name(
            'screentime-section-header'
        );

        this._indicator.menu.addMenuItem(item);
    }
    
    _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

_getGraphColor() {
    const mode =
        this._settings.get_string('bar-color-mode');

    if (mode === 'accent')
        return this._getThemeAccentColor();

    const color =
        this._settings.get_string('bar-color');

    // Convert rgb(r, g, b) to hex
    const match = color.match(
        /rgb\((\d+),\s*(\d+),\s*(\d+)\)/
    );

    if (match) {
        return '#' +
            Number(match[1]).toString(16).padStart(2, '0') +
            Number(match[2]).toString(16).padStart(2, '0') +
            Number(match[3]).toString(16).padStart(2, '0');
    }

    return color;
}

    _addWeeklyGraph() {
        const graphItem =
            new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });

        const graphBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'screentime-graph',
        });

        const days = [];

        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);

            const key =
                `${date.getFullYear()}-` +
                `${String(
                    date.getMonth() + 1
                ).padStart(2, '0')}-` +
                `${String(
                    date.getDate()
                ).padStart(2, '0')}`;

            days.push({
                key,
                label: date.toLocaleDateString(
                    undefined,
                    {weekday: 'short'}
                ),
                seconds:
                    this._history[key]?.screenTime || 0,
            });
        }

        const maxSeconds = Math.max(
            ...days.map(day => day.seconds),
            1
        );
        
        const accentColor = this._getGraphColor();

        for (const day of days) {
            // Each column is clickable
                        const selected =
                day.key === this._selectedDate;

            const columnButton =
                new St.Button({
                    reactive: true,
                    can_focus: true,
                    x_expand: true,
                    style_class:
                        selected
                            ? 'screentime-graph-column screentime-graph-column-selected'
                            : 'screentime-graph-column',
                });

            // Accent-colour hover effect
            columnButton.connect('enter-event', () => {
                if (!selected) {
                    columnButton.set_style(
                        `background-color: ${this._hexToRgba(
                            accentColor,
                            0.12
                        )};`
                    );
                }
            });

            columnButton.connect('leave-event', () => {
                if (!selected)
                    columnButton.set_style('');
            });

            const column =
                new St.BoxLayout({
                    vertical: true,
                    x_expand: true,
                });

            const timeLabel =
                new St.Label({
                    text: day.seconds > 0
                        ? this._formatTime(
                            day.seconds,
                            false
                        )
                        : '',
                    x_align:
                        Clutter.ActorAlign.CENTER,
                    style_class:
                        'screentime-graph-time',
                });

            const barArea =
                new St.BoxLayout({
                    vertical: true,
                    height: 70,
                    x_expand: true,
                    style_class:
                        'screentime-bar-area',
                });

            const barHeight =
                day.seconds > 0
                    ? Math.max(
                        8,
                        Math.round(
                            (day.seconds /
                                maxSeconds) * 70
                        )
                    )
                    : 0;

            const spacerHeight =
                70 - barHeight;

            if (spacerHeight > 0) {
                barArea.add_child(
                    new St.Widget({
                        height: spacerHeight,
                    })
                );
            }

           if (barHeight > 0) {
    let borderRadius;

    if (barHeight <= 8) {
        borderRadius =
            `${Math.floor(barHeight / 2)}px`;
    } else {
        borderRadius = '6px 6px 2px 2px';
    }

    const barColor = selected
        ? accentColor
        : this._hexToRgba(accentColor, 0.35);

    const bar = new St.Widget({
        height: barHeight,
        x_expand: true,

        style_class: selected
            ? 'screentime-graph-bar screentime-graph-bar-selected'
            : 'screentime-graph-bar',

        style: `
            background-color: ${barColor};
            border-radius: ${borderRadius};
        `,
    });

    barArea.add_child(bar);
}
            const dayLabel =
                new St.Label({
                    text: day.label,
                    x_align:
                        Clutter.ActorAlign.CENTER,
                    style_class:
                        'screentime-graph-day',
                });

            column.add_child(timeLabel);
            column.add_child(barArea);
            column.add_child(dayLabel);

            columnButton.set_child(column);

            columnButton.connect('clicked', () => {
                this._selectedDate = day.key;
                this._updateUI();
            });

            graphBox.add_child(columnButton);
        }

        graphItem.add_child(graphBox);

        this._indicator.menu.addMenuItem(
            graphItem
        );
    }
    
    _showUsageNotification(seconds) {
    const minutes = Math.floor(seconds / 60);

    let timeText;

    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (remainingMinutes === 0) {
            timeText = hours === 1
                ? '1 hour'
                : `${hours} hours`;
        } else {
            timeText = `${hours}h ${remainingMinutes}m`;
        }
    } else {
        timeText = minutes === 1
            ? '1 minute'
            : `${minutes} minutes`;
    }

    Main.notify(
        'Screen Time',
        `You've been using your computer for ${timeText}.`
    );
}

    _formatTime(seconds, showSeconds) {
        const hours =
            Math.floor(seconds / 3600);

        const minutes =
            Math.floor(
                (seconds % 3600) / 60
            );

        const secs = seconds % 60;

        if (hours > 0) {
            return showSeconds
                ? `${hours}h ${minutes}m ${secs}s`
                : `${hours}h ${minutes}m`;
        }

        if (minutes > 0) {
            return showSeconds
                ? `${minutes}m ${secs}s`
                : `${minutes}m`;
        }

        return showSeconds
            ? `${secs}s`
            : '0m';
    }

    disable() {
        if (this._timerId !== null) {
            GLib.Source.remove(this._timerId);
            this._timerId = null;
        }

        if (this._saveTimerId !== null) {
            GLib.Source.remove(
                this._saveTimerId
            );
            this._saveTimerId = null;
        }

        this._saveData();

        if (this._settingsChangedId) {
            this._settings.disconnect(
                this._settingsChangedId
            );

            this._settingsChangedId = null;
        }

        this._indicator?.destroy();

        this._indicator = null;
        this._box = null;
        this._label = null;
        this._tracker = null;
        this._settings = null;
        this._history = {};
        this._todayData = null;
        this._selectedDate = null;
    }
}
