(() => {

	'use strict';

	angular
	.module('app')
	.controller('CAdmin', function($scope, $state, $stateParams, $auth, $location, toastr, FApi, FAdmin)
	{

		const socket = io.connect(window.location.host);
		const $pollResultChart = $('#pollResultChart');

		let vm = this;

		vm.isListMenuActive = true;
		vm.pollList = [];
		vm.billboardPollIndex = FAdmin.billboardPollIndex;
		vm.billboardPoll = FAdmin.billboardPoll;
		vm.isActivePoll = false;
		vm.voteTotal = 0;
		vm.connections = 0;



		$(window).resize(function() {
			if ($(window).width() > 600) {
				vm.isListMenuActive = true;
				$scope.$digest();
			}
		});



		// ------------------------------------------------------------
		// Name: denyEntry
		// User is not administrator... deal with them!
		// ------------------------------------------------------------
		const denyEntry = function() {
			// Deny thy entry!!!
    	$state.go('landing');
    	toastr.error('You must be an administrator to access this page!');
		}



		// ------------------------------------------------------------
		// Name: adminCheck
		// Verify the user is an administrator
		// ------------------------------------------------------------
		const adminCheck = function() {
			try {
				if($auth.isAuthenticated()) {
					let promise = FApi.getUserDetails();

					// Upon successful return...
		      promise.then(response => {
		        let user 		= response.data,
		        		isAdmin = false;

		        // Is user administrator?
		        if(!user.isAdministrator) {
		        	denyEntry();
		        } else {
		        	$('#adminCheck').hide();
		        }
		      })
	      	// Upon unsuccessful return...
					promise.catch((error) => {
						// Throw error
						throw new Error(error);
					})
				} else {
					denyEntry();
				}
			} catch(error) {
				toastr.error(error.message, error.name);
			}
		}



		// Very user is admin before moving forward
		adminCheck();



		// ------------------------------------------------------------
		// Name: toggleListMenu
		// Toggles the poll list selection menu
		// ------------------------------------------------------------
		vm.toggleListMenu = function() {
			vm.isListMenuActive = vm.isListMenuActive ? false : true;
		}



		// ------------------------------------------------------------
		// Name: setSelectedPoll
		// Sets selected and isActivePoll boolean. Called on sidebar select
		// ------------------------------------------------------------
		vm.setSelectedPoll = function(poll) {
			if(!poll) { poll = vm.pollList[0] };

			// Load variables with select poll states.
			let index = vm.pollList.indexOf(poll);

			// Update local and factory stored data
			vm.billboardPollIndex 		= index;
			vm.billboardPoll 					= poll;
			vm.isActivePoll 					= poll.isActiveQuestion;
			FAdmin.billboardPollIndex = vm.billboardPollIndex;

			// Update chart data
			updateChartData();

			if($(window).width() <= 600) {
				vm.toggleListMenu();
			}
		}



		// ------------------------------------------------------------
		// Name: setBillboardPoll
		// Sets billboardPoll as selected poll. Changes state to billboard
		// ------------------------------------------------------------
		vm.setBillboardPoll = function() {

			// Go to billboard view (fullscreen)
			$state.go('billboard');

		}


		socket.on('connections', (data) => {
      if(data.data) {
      	vm.connections = data.data;
      	$scope.$digest();
      }
    });


		// Get live results of user votes
		socket.on('getLiveResults', (data) => {

			// Data returned?
      if(data.data) {

      	// Yes, load data into pollList
      	vm.pollList = data.data;

    		// Set billboardPoll with fresh data at index stored in FAdmin
    		vm.setSelectedPoll(vm.pollList[FAdmin.billboardPollIndex]);

      	// Update the chart data
      	updateChartData();

      	// Reload view
      	$scope.$digest();

      } else {
      	// No, return error to user
      	toastr.error(data.error);
      }
    });



		// ------------------------------------------------------------
		// Name: updateChartData
		// Updates the data used to measure chart option vote percentage
		// ------------------------------------------------------------
		const updateChartData = function() {

			// Ensure our jQuery divs are ready to go
			$(document).ready(() => {

				// Reset vote total
				let voteTotal = 0;

				// Get vote total to calculate average
				vm.billboardPoll._pollOptions.forEach(option => {
					voteTotal += option.pollOptionSelectCount;
				})

				// Perform calculations on this go around
				vm.billboardPoll._pollOptions.forEach(option => {

					// Capture option's div
					let $option = $('#option' + option.pollOptionSortOrder);

					// Calculate average for option
					let average = ((option.pollOptionSelectCount / voteTotal) * 100).toFixed(2);

					// If there are no votes default all averages to 0
					if(voteTotal < 1) { average = 0 };

					// Load data into view
					$option.width(average + '%');
					$option.siblings('.option-percentage').text(average + '%');
				})

				// Update vote total
				vm.voteTotal = voteTotal;

				// Reload view
      	$scope.$digest();
			})
		}



		// ------------------------------------------------------------
		// Name: toggleIsActive
		// Toggles poll's active boolean on database and locally
		// ------------------------------------------------------------
		vm.toggleIsActive = function() {
			try {

				// Send isActive toggle request to server
				let promise = FApi.toggleIsActive(vm.pollList[vm.billboardPollIndex]._id)

				// Upon successful return...
				promise.then(response => {

					// Does response have data property?
					if(response.hasOwnProperty('data')) {

						vm.pollList[vm.billboardPollIndex].isActiveQuestion = vm.pollList[vm.billboardPollIndex].isActiveQuestion ? false : true;

						// Yes, load data's activeState
						vm.isActivePoll = response.data.activeState;
					}
				})

				// Upon unsuccessful return...
				promise.catch((error) => {

					// Throw error
					throw new Error(error);

				})
			} catch(error) {
				toastr.error(error.message, error.name);
			}
		}


	})

})();
