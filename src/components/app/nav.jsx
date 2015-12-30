import _ from 'underscore';
import React from 'react';
import {Link, History} from 'react-router';
import * as BS from 'react-bootstrap';
import HTML5Backend from 'react-dnd-html5-backend';
import { DragDropContext } from 'react-dnd';

import SettingsStore from '../../settings-store';
import Client from '../../github-client';
import NewVersionChecker from '../../new-version-checker';
import CurrentUserStore from '../../user-store';
import FilterStore from '../../filter-store';
import IssueStore from '../../issue-store';
import history from '../../history';
import {getFilters, buildRoute} from '../../route-utils';
import {getReposFromStr, convertRepoInfosToStr} from '../../helpers';

import LoginModal from '../login-modal';
import LabelBadge from '../label-badge';
import MoveModal from '../move-modal';
import Time from '../time';
import Loadable from '../loadable';
import GithubFlavoredMarkdown from '../gfm';


const SettingsItem = React.createClass({
  render() {
    const {key, onSelect, isChecked, className, children} = this.props;

    return (
      <BS.MenuItem key={key} onSelect={onSelect} className={className}>
        <span className='settings-item-checkbox' data-checked={isChecked}>{children}</span></BS.MenuItem>
    );
  }
});

const MilestonesDropdown = React.createClass({
  mixins: [History],
  componentDidMount() {
    FilterStore.on('change:milestone', this.update);
  },
  componentWillUnmount() {
    FilterStore.off('change:milestone', this.update);
  },
  update() {
    this.forceUpdate();
  },
  onSelectMilestone(milestone) {
    return () => {
      FilterStore.toggleMilestone(milestone);
    };
  },
  onClearMilestones() {
    FilterStore.clearMilestoneFilter();
  },
  onSelectMilestonePlanning() {
    const {repoInfos} = this.props;

    this.history.pushState(null, buildRoute('by-milestone', {repoInfos}));
  },
  render() {
    const {milestones} = this.props;
    const selectedMilestones = FilterStore.getMilestones();

    const renderMilestone = (milestone) => {
      let dueDate;
      if (milestone.dueOn) {
        dueDate = (
          <span key='due-at' className='due-at'>
            {' due '}
            <Time dateTime={new Date(milestone.dueOn)}/>
          </span>
        );
      }
      return [
        <i key='icon' className='milestone-icon octicon octicon-milestone'/>,
        <span key='milestone-title' className='milestone-title'>
          <GithubFlavoredMarkdown
            inline
            disableLinks={true}
            text={milestone.title}/>
        </span>,
        dueDate
      ];
    };

    if (milestones.length) {
      const milestonesItems = _.map(milestones, (milestone) => {
        return (
          <SettingsItem
            className='milestone-item'
            key={milestone.title}
            isChecked={FilterStore.getMilestones().length && FilterStore.isMilestoneIncluded(milestone)}
            onSelect={this.onSelectMilestone(milestone)}
          >{renderMilestone(milestone)}</SettingsItem>
        );
      });
      let clearMilestoneFilter;
      if (FilterStore.getMilestones().length) {
        clearMilestoneFilter = (
          <BS.MenuItem key='clear' onSelect={this.onClearMilestones}>Clear Milestone Filter</BS.MenuItem>
        );
      }

      let selectedMilestoneItem;
      if (selectedMilestones.length) {
        if (selectedMilestones.length > 1) {
          selectedMilestoneItem = `${selectedMilestones.length} milestones`;
        } else {
          // Only 1 milestone is selected so show the milestone title
          selectedMilestoneItem = renderMilestone(selectedMilestones[0]);
        }
      } else {
        selectedMilestoneItem = 'All Issues and Pull Requests';
      }
      return (
        <BS.NavDropdown id='milestone-dropdown' className='milestone-dropdown' title={<span className='selected-milestone'>{selectedMilestoneItem}</span>}>
          <BS.MenuItem key='1' header>Filter by Milestone</BS.MenuItem>
          {milestonesItems}
          {clearMilestoneFilter}
          <BS.MenuItem key='3' divider/>
          <BS.MenuItem key='4' disabled>Not in a Milestone</BS.MenuItem>
          <BS.MenuItem key='5' divider/>
          <BS.MenuItem key='6' onSelect={this.onSelectMilestonePlanning}>Milestone Planning View</BS.MenuItem>
        </BS.NavDropdown>
      );
    } else {
      return null;
    }

  }
});

const MilestonesDropdownShell = React.createClass({
  render() {
    const {repoInfos} = this.props;
    // Use primary repo
    const [{repoOwner, repoName}] = repoInfos;

    return (
      <Loadable
        promise={IssueStore.fetchMilestones(repoOwner, repoName)}
        renderLoaded={(milestones) => <MilestonesDropdown repoInfos={repoInfos} milestones={milestones}/>}
        />
    );
  }
});

const AppNav = React.createClass({
  getInitialState() {
    return {info: null, showModal: false};
  },
  componentDidMount() {
    FilterStore.on('change', this.update);
    SettingsStore.on('change', this.update);
    SettingsStore.on('change:showPullRequestData', this.update);
    SettingsStore.on('change:tableLayout', this.update);
    Client.on('changeToken', this.onChangeToken);
    this.onChangeToken();
  },
  componentWillUnmount() {
    FilterStore.off('change', this.update);
    SettingsStore.off('change', this.update);
    SettingsStore.off('change:showPullRequestData', this.update);
    SettingsStore.off('change:tableLayout', this.update);
    Client.off('changeToken', this.onChangeToken);
  },
  update() {
    this.setState({});
  },
  onChangeToken() {
    CurrentUserStore.fetchUser()
    .then((info) => {
      // TODO: when anonymous, getting the current user should be an error.
      // probably a bug in CurrentUserStore
      if (info) {
        SettingsStore.setShowPullRequestData();
      }
      this.setState({info});
    }).catch(() => {
      this.setState({info: null});
    });
  },
  onSignOut() {
    Client.setToken(null);
    CurrentUserStore.clear();
  },
  starThisProject() {
    Client.getOcto().user.starred('philschatz/gh-board').add().then(() => {
      /*eslint-disable no-alert */
      alert('Thanks for starring!\n I hope you enjoy the other pages more than this simple alert, but thank you for helping me out!');
      /*eslint-enable no-alert */
    });
  },
  render() {
    let routeInfo = getFilters();
    let {repoInfos} = routeInfo;
    const {info, showModal} = this.state;

    // Note: The dashboard page does not have a list of repos
    const close = () => this.setState({ showModal: false});

    const brand = (
      <Link to={buildRoute('dashboard')}><i className='octicon octicon-home'/></Link>
    );
    const filtering = _.map(FilterStore.getLabels(), (label) => {
      return (
        <LabelBadge label={label} onClick={() => FilterStore.removeLabel(label)}/>
      );
    });

    const filterUser = FilterStore.getUser();
    if (filterUser) {
      filtering.push(
        <BS.Badge key='user' onClick={() => FilterStore.clearUser()}>{filterUser.login}</BS.Badge>
      );
    }

    let loginButton;
    if (info) {
      const avatarImage = (
        <img
          alt={'@' + info.login}
          className='avatar-image'
          src={info.avatar.url}/>
      );
      loginButton = (
        <BS.NavDropdown key='signin-dropdown' id='signin-dropdown' title={avatarImage}>
          <BS.MenuItem key='1' header>Signed in as <strong>{info.login}</strong></BS.MenuItem>
          <BS.MenuItem key='2' onSelect={this.starThisProject}>Click to <i className='octicon octicon-star icon-spin' style={{color: '#fbca04'}}/> the <strong>gh-board</strong> repo if you like this project</BS.MenuItem>
          <BS.MenuItem key='3' divider/>
          <BS.MenuItem key='4' eventKey='1'><span onClick={this.onSignOut}>Sign Out</span></BS.MenuItem>
        </BS.NavDropdown>
      );
    } else {
      loginButton = (
        <BS.NavItem className='sign-in' onClick={() => this.setState({showModal: true})}>Sign In</BS.NavItem>
      );
    }

    const settingsTitle = (
      <i className='octicon octicon-gear'/>
    );

    let repoDetails = null;
    let milestonesDropdown = null;
    if (!filtering.length && repoInfos.length) {
      // Grab the 1st repo
      const [{repoOwner, repoName}] = repoInfos;
      let repoNameItems;
      if (repoInfos.length === 1) {
        repoNameItems = (
          <span className='repo-name'>{repoName}</span>
        );
      } else {
        repoNameItems = _.map(repoInfos, ({repoOwner, repoName}, index) => {
          const repoInfos = [{repoOwner, repoName}];
          const repoLink = buildRoute(null, {repoInfos});
          return (
            <span key={repoLink} className='repo-name-wrap'>
              {index !== 0 && '&' || null}{/* Put an & between repo names */}
              <Link to={repoLink} className='repo-name'>{repoName}</Link>
            </span>
          );
        });
      }
      repoDetails = (
        <li className='repo-links'>
          <span className='repo-owner'>{repoOwner}</span>
          {'/'}
          {repoNameItems}
        </li>
      );
      milestonesDropdown = (
        <MilestonesDropdownShell repoInfos={repoInfos}/>
      );
    }

    const settingsMenuHelp = () => {
      /*eslint-disable no-alert */
      alert('When an Issue and Pull Request are linked (by writing "fixes #123" in the Pull Request description) the related Issue/Pull request is removed from the list.\n Developers will probably want to see the Pull Request in their board (since they created it) while QA would probably rather see the Issue (since they created it).');
      /*eslint-enable no-alert */
    };

    const repoLink = buildRoute('by-user', {repoInfos});
    let managerMenu;
    if (repoInfos.length) {
      managerMenu = (
        <BS.MenuItem key='manager' href={'#' + repoLink}>Manager (Issues by User)</BS.MenuItem>
      );
    }

    return (
      <div className='app-nav'>
        <BS.Navbar className='topbar-nav' fixedTop>
          <BS.Navbar.Header>
            <BS.Navbar.Brand>{brand}</BS.Navbar.Brand>
          </BS.Navbar.Header>
          <BS.Nav key='repo-details'>
            {repoDetails}
            <BS.NavItem className='active-filter'>
              {filtering}
            </BS.NavItem>
          </BS.Nav>
          <BS.Nav key='right' pullRight>
            {milestonesDropdown}
            <BS.NavDropdown key='settings' id='display-settings' title={settingsTitle}>
              <BS.MenuItem key='display' header>Display Settings</BS.MenuItem>
              <SettingsItem
                key='HideUncategorized'
                onSelect={SettingsStore.toggleHideUncategorized.bind(SettingsStore)}
                isChecked={SettingsStore.getHideUncategorized()}
                >
                Hide Uncategorized
              </SettingsItem>
              <SettingsItem
                key='ShowEmptyColumns'
                onSelect={SettingsStore.toggleShowEmptyColumns.bind(SettingsStore)}
                isChecked={SettingsStore.getShowEmptyColumns()}
                >
                Show Empty Columns
              </SettingsItem>
              <SettingsItem
                key='TableLayout'
                onSelect={SettingsStore.toggleTableLayout.bind(SettingsStore)}
                isChecked={SettingsStore.getTableLayout()}
                >
                Use Table Layout
              </SettingsItem>
              <BS.MenuItem key='divider' divider/>
              <BS.MenuItem key='viewing-mode' header>Viewing Mode
                <button
                  className='btn btn-xs btn-default'
                  onClick={settingsMenuHelp}
                  >
                  <i className='octicon octicon-question'/>
                </button>
              </BS.MenuItem>
              <SettingsItem
                key='RelatedHideIssues'
                onSelect={SettingsStore.setRelatedHideIssues.bind(SettingsStore)}
                isChecked={SettingsStore.getRelatedHideIssues()}
                >
                Developer-Friendly
              </SettingsItem>
              <SettingsItem
                key='RelatedHidePullRequests'
                onSelect={SettingsStore.setRelatedHidePullRequests.bind(SettingsStore)}
                isChecked={SettingsStore.getRelatedHidePullRequests()}
                >
                QA-Friendly
              </SettingsItem>
              <SettingsItem
                key='RelatedShowAll'
                onSelect={SettingsStore.setRelatedShowAll.bind(SettingsStore)}
                isChecked={SettingsStore.getRelatedShowAll()}
                >
                Combined
              </SettingsItem>
              {managerMenu}
              <BS.MenuItem key='divider2' divider/>
              <BS.MenuItem key='api-settings' header>GitHub API Settings</BS.MenuItem>
              <SettingsItem
                key='ShowPullRequestData'
                onSelect={SettingsStore.toggleShowPullRequestData.bind(SettingsStore)}
                isChecked={SettingsStore.getShowPullRequestData()}
                >
                Show More Pull Request Info
              </SettingsItem>
            </BS.NavDropdown>
            {loginButton}
          </BS.Nav>
        </BS.Navbar>
        <LoginModal show={showModal} container={this} onHide={close}/>
        <MoveModal container={this}/>
      </div>
    );
  }

});

export default AppNav;