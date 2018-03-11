import React, {Component} from 'react';
import ModDetail from '../components/ModDetail/ModDetail';
import StatClassifier from '../utils/StatClassifier';
import Stat from '../components/domain/Stat';
import './boilerplate.css';
import './App.css';
import Mod from "../components/domain/Mod";

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {};
    const fileContents = {
      mods: [{
        "mod_uid": "Jyye0fVHSVWBQYntUkvc0A",
        "slot": "square",
        "set": "health",
        "level": 15,
        "pips": 5,
        "primaryBonusType": "Offense",
        "primaryBonusValue": "+5.88%",
        "secondaryType_1": "Protection %",
        "secondaryValue_1": "+3.79",
        "secondaryType_2": "Protection",
        "secondaryValue_2": "+1350",
        "secondaryType_3": "Potency",
        "secondaryValue_3": "+2.47%",
        "secondaryType_4": "Speed",
        "secondaryValue_4": "+4",
        "characterName": "Royal Guard"
      },
        {
          "mod_uid": "EVsQqe1DQFeBiO5xFm9JdA",
          "slot": "arrow",
          "set": "health",
          "level": 15,
          "pips": 5,
          "primaryBonusType": "Protection",
          "primaryBonusValue": "+23.5%",
          "secondaryType_1": "Protection",
          "secondaryValue_1": "+1322",
          "secondaryType_2": "Health %",
          "secondaryValue_2": "+0.64",
          "secondaryType_3": "Defense %",
          "secondaryValue_3": "+1.03",
          "secondaryType_4": "Potency",
          "secondaryValue_4": "+2.01%",
          "characterName": "Royal Guard"
        },
        {
          "mod_uid": "zjPxI5OJR9-6NF1TY6D2FA",
          "slot": "diamond",
          "set": "health",
          "level": 15,
          "pips": 5,
          "primaryBonusType": "Defense",
          "primaryBonusValue": "+11.75%",
          "secondaryType_1": "Protection",
          "secondaryValue_1": "+1899",
          "secondaryType_2": "Potency",
          "secondaryValue_2": "+1.6%",
          "secondaryType_3": "Health %",
          "secondaryValue_3": "+0.9",
          "secondaryType_4": "Offense",
          "secondaryValue_4": "+34",
          "characterName": "Royal Guard"
        },
        {
          "mod_uid": "2s4kcfvjSF6LXqB6aVD4Ew",
          "slot": "triangle",
          "set": "health",
          "level": 15,
          "pips": 5,
          "primaryBonusType": "Offense",
          "primaryBonusValue": "+5.88%",
          "secondaryType_1": "Potency",
          "secondaryValue_1": "+2.95%",
          "secondaryType_2": "Defense",
          "secondaryValue_2": "+7",
          "secondaryType_3": "Offense",
          "secondaryValue_3": "+39",
          "secondaryType_4": "Tenacity",
          "secondaryValue_4": "+1.76%",
          "characterName": "Colonel Starck"
        },
        {
          "mod_uid": "DDclhlmkT9GPhVU8gpW6AQ",
          "slot": "circle",
          "set": "health",
          "level": 15,
          "pips": 5,
          "primaryBonusType": "Protection",
          "primaryBonusValue": "+23.5%",
          "secondaryType_1": "Potency",
          "secondaryValue_1": "+1.52%",
          "secondaryType_2": "Speed",
          "secondaryValue_2": "+12",
          "secondaryType_3": "Defense",
          "secondaryValue_3": "+8",
          "secondaryType_4": "Critical Chance",
          "secondaryValue_4": "+1.61%",
          "characterName": "Colonel Starck"
        },
        {
          "mod_uid": "xzqqNh9bRk6BDo9XLY8LOQ",
          "slot": "cross",
          "set": "health",
          "level": 15,
          "pips": 5,
          "primaryBonusType": "Protection",
          "primaryBonusValue": "+23.5%",
          "secondaryType_1": "Protection",
          "secondaryValue_1": "+657",
          "secondaryType_2": "Potency",
          "secondaryValue_2": "+1.5%",
          "secondaryType_3": "Offense",
          "secondaryValue_3": "+44",
          "secondaryType_4": "Defense %",
          "secondaryValue_4": "+1.24",
          "characterName": "Royal Guard"
        }]
    };

    this.state.mods = App.readMods(fileContents.mods);
  }

  /**
   * Given the input from a file exported from the Mods Manager Importer, read mods into memory in the format
   * used by this application
   *
   * @param fileInput array The parsed contents of the file generated by the Mods Manager Importer
   */
  static readMods(fileInput) {
    let mods = [];

    for (let i = 0; i < fileInput.length; i++) {
      const fileMod = fileInput[i];
      const primaryStat = new Stat(fileMod.primaryBonusType, fileMod.primaryBonusValue);
      let secondaryStats = [];

      if ('' !== fileMod.secondaryValue_1) {
        secondaryStats.push(new Stat(fileMod.secondaryType_1, fileMod.secondaryValue_1));
      }
      if ('' !== fileMod.secondaryValue_2) {
        secondaryStats.push(new Stat(fileMod.secondaryType_2, fileMod.secondaryValue_2));
      }
      if ('' !== fileMod.secondaryValue_3) {
        secondaryStats.push(new Stat(fileMod.secondaryType_3, fileMod.secondaryValue_3));
      }
      if ('' !== fileMod.secondaryValue_4) {
        secondaryStats.push(new Stat(fileMod.secondaryType_4, fileMod.secondaryValue_4));
      }

      mods.push(new Mod(
        fileMod.id,
        fileMod.slot,
        fileMod.set,
        fileMod.level,
        fileMod.pips,
        primaryStat,
        secondaryStats,
        fileMod.characterName
      ));
    }

    const statClassifier = new StatClassifier(App.calculateStatCategoryRanges(mods));
    for (let i = 0; i < mods.length; i++) {
      mods[i].classifyStats(statClassifier);
    }

    return mods;
  }

  /**
   * For each type of secondary stat on a mod, calculate the minimum and maximum values found
   *
   * @param mods array
   * @returns object An object with a property for each secondary stat type, with values of "min" and "max"
   */
  static calculateStatCategoryRanges(mods) {
    let allStats = [];
    let statGroups = {};
    let statRanges = {};

    // Collect all stat values on all mods
    for (let i = 0; i < mods.length; i++) {
      allStats = allStats.concat(mods[i].secondaryStats);
    }

    // Group the stat values by the stat type
    for (let i = 0; i < allStats.length; i++) {
      let stat = allStats[i];

      if ('undefined' !== typeof statGroups[stat.type]) {
        statGroups[stat.type].push(stat.value);
      } else {
        statGroups[stat.type] = [stat.value];
      }
    }

    // Find the minimum and maximum of each stat type
    for (let type in statGroups) {
      statRanges[type] = statGroups[type].reduce(
        (minMax, statValue) => {
          if (statValue < minMax.min) {
            minMax.min = statValue;
          }
          if (statValue > minMax.max) {
            minMax.max = statValue;
          }
          return minMax;
        },
        {'min': Infinity, 'max': 0}
      );
    }

    return statRanges;
  }

  render() {
    const modElements = this.state.mods.map(
      (mod) => <ModDetail key={mod.id} mod={mod}/>
    );

    return (
      <div className="App">
        <header className="App-header">
          <h1 className="App-title">Matt's Mod Manager for SWGOH</h1>
        </header>
        <div className='app-body'>
          <div className='mods'>
            {modElements}
          </div>
        </div>
      </div>
    );
  }
}

export default App;