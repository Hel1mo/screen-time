import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';

import {
    ExtensionPreferences,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ScreenTimePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Screen Time',
            icon_name: 'preferences-system-time-symbolic',
        });

        window.add(page);

        const displayGroup = new Adw.PreferencesGroup({
            title: 'Display',
            description:
                'Choose what is shown by the Screen Time indicator.',
        });

        page.add(displayGroup);

        const secondsRow = new Adw.SwitchRow({
            title: 'Show seconds',
            subtitle:
                'Show seconds in the top bar and app list.',
        });

        settings.bind(
            'show-seconds',
            secondsRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        displayGroup.add(secondsRow);

        const appsRow = new Adw.SwitchRow({
            title: 'Show app breakdown',
            subtitle:
                'Show how much time was spent in each application.',
        });

        settings.bind(
            'show-app-breakdown',
            appsRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        displayGroup.add(appsRow);
        
        const appearanceGroup = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Customize the Screen Time graph.',
        });

        page.add(appearanceGroup);
        
        const accentRow = new Adw.SwitchRow({
            title: 'Use system accent colour',
            subtitle:
                'Use your GNOME or theme accent colour for graph bars.',
        });

        appearanceGroup.add(accentRow);
        
        accentRow.active =
            settings.get_string('bar-color-mode') === 'accent';

        accentRow.connect('notify::active', () => {
            settings.set_string(
                'bar-color-mode',
                accentRow.active ? 'accent' : 'custom'
            );
        });
        
        const colorRow = new Adw.ActionRow({
            title: 'Graph colour',
            subtitle: 'Choose a custom colour for the graph bars.',
        });

        const colorButton = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            use_alpha: false,
        });

        colorRow.add_suffix(colorButton);
        appearanceGroup.add(colorRow);
        
        const rgba = new Gdk.RGBA();

        rgba.parse(
            settings.get_string('bar-color')
        );

        colorButton.set_rgba(rgba);
        
        colorButton.connect('color-set', () => {
            const colour =
                colorButton.get_rgba().to_string();

            settings.set_string(
                'bar-color',
                colour
            );
        });
        
        const updateColorSensitivity = () => {
            colorRow.sensitive = !accentRow.active;
        };

        updateColorSensitivity();

        accentRow.connect(
            'notify::active',
            updateColorSensitivity
        );
        
        const notificationGroup = new Adw.PreferencesGroup({
    title: 'Screen Time Reminders',
    description:
        'Get reminders about how long you have been using your computer.',
});

page.add(notificationGroup);

const notificationsRow = new Adw.SwitchRow({
    title: 'Enable reminders',
    subtitle:
        'Show notifications about your screen time.',
});

settings.bind(
    'notifications-enabled',
    notificationsRow,
    'active',
    Gio.SettingsBindFlags.DEFAULT
);

notificationGroup.add(notificationsRow);

const intervalRow = new Adw.ComboRow({
    title: 'Reminder interval',
    subtitle:
        'How often to show a screen time reminder.',
    model: Gtk.StringList.new([
        '5 minutes',
        '15 minutes',
        '30 minutes',
        '1 hour',
        '2 hours',
    ]),
});

notificationGroup.add(intervalRow);

const intervals = [
    300,
    900,
    1800,
    3600,
    7200,
];

const currentInterval =
    settings.get_int('notification-interval');

let selectedIndex =
    intervals.indexOf(currentInterval);

if (selectedIndex === -1)
    selectedIndex = 2;

intervalRow.selected = selectedIndex;

intervalRow.connect('notify::selected', () => {
    settings.set_int(
        'notification-interval',
        intervals[intervalRow.selected]
    );
});
        
        const dataGroup = new Adw.PreferencesGroup({
            title: 'Data',
            description:
                'Usage statistics are stored locally on this computer.',
        });

        page.add(dataGroup);

        const resetRow = new Adw.ActionRow({
            title: "Reset today's data",
            subtitle:
                "Set today's screen time and app usage back to zero.",
        });

        const resetButton = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
        });

        resetRow.add_suffix(resetButton);
        dataGroup.add(resetRow);

        resetButton.connect('clicked', () => {
            settings.set_boolean('reset-data', true);
        });

        const infoRow = new Adw.ActionRow({
            title: 'Data location',
            subtitle:
                '~/.local/share/screentime@helimo.json',
        });

        dataGroup.add(infoRow);
    }
}
